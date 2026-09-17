import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { refundOrder, requestReceiptReprint } from '../sales/salesApi'
import type { PaymentMethod } from '../sales/salesTypes'
import { deleteSalesHistoryOrder, loadHistoryPage } from './reportsApi'
import { isValidDateRange, todayInBangkok, toBangkokEnd, toBangkokStart } from './dateRange'
import type { HistoryRow } from './reportTypes'

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
function formatMoney(value: number) { return money.format(value) }
function statusLabel(status: HistoryRow['status']) { return ({ paid: 'ชำระแล้ว', refunded: 'คืนเงินแล้ว', void: 'ยกเลิก', open: 'ค้างชำระ' })[status] }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ' }
type HistoryCursor = { readonly closedAt: string; readonly orderId: string }

export function HistoryPage() {
  const { profile } = useAuth()
  const [from, setFrom] = useState(todayInBangkok())
  const [to, setTo] = useState(todayInBangkok())
  const [orderNumber, setOrderNumber] = useState('')
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [selected, setSelected] = useState<HistoryRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<HistoryRow | null>(null)
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash')
  const [refundReason, setRefundReason] = useState('')
  const [showRefund, setShowRefund] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const initialLoad = useRef(false)
  const [currentCursor, setCurrentCursor] = useState<HistoryCursor | null>(null)
  const [cursorStack, setCursorStack] = useState<(HistoryCursor | null)[]>([])
  const [hasMore, setHasMore] = useState(false)

  const search = useCallback(async () => {
    const sequence = ++requestSequence.current
    setIsLoading(true); setErrorMessage(null); setNotice(null)
    if (!isValidDateRange(from, to)) { setErrorMessage('ช่วงวันที่ไม่ถูกต้อง'); setIsLoading(false); return }
    try {
      const page = await loadHistoryPage(toBangkokStart(from), toBangkokEnd(to), orderNumber ? Number(orderNumber) : null, null)
      if (sequence === requestSequence.current) { setRows(page.rows); setHasMore(page.hasMore); setCurrentCursor(null); setCursorStack([]) }
    } catch (error: unknown) { if (sequence === requestSequence.current) setErrorMessage(errorText(error)) }
    finally { if (sequence === requestSequence.current) setIsLoading(false) }
  }, [from, orderNumber, to])

  useEffect(() => { if (initialLoad.current) return; initialLoad.current = true; void Promise.resolve().then(search) }, [search])

  const nextPage = async () => {
    const last = rows.at(-1)
    if (!last?.closedAt || !hasMore) return
    const nextCursor: HistoryCursor = { closedAt: last.closedAt, orderId: last.orderId }
    const sequence = ++requestSequence.current
    setIsLoading(true)
    try {
      const page = await loadHistoryPage(toBangkokStart(from), toBangkokEnd(to), orderNumber ? Number(orderNumber) : null, nextCursor)
      if (sequence !== requestSequence.current) return
      setCursorStack((current) => [...current, currentCursor]); setCurrentCursor(nextCursor); setRows(page.rows); setHasMore(page.hasMore)
    } catch (error: unknown) { if (sequence === requestSequence.current) setErrorMessage(errorText(error)) }
    finally { if (sequence === requestSequence.current) setIsLoading(false) }
  }

  const previousPage = async () => {
    const previous = cursorStack.at(-1) ?? null
    const sequence = ++requestSequence.current
    setIsLoading(true)
    try {
      const page = await loadHistoryPage(toBangkokStart(from), toBangkokEnd(to), orderNumber ? Number(orderNumber) : null, previous)
      if (sequence !== requestSequence.current) return
      setCursorStack((current) => current.slice(0, -1)); setCurrentCursor(previous); setRows(page.rows); setHasMore(page.hasMore)
    } catch (error: unknown) { if (sequence === requestSequence.current) setErrorMessage(errorText(error)) }
    finally { if (sequence === requestSequence.current) setIsLoading(false) }
  }

  const printAgain = async (row: HistoryRow) => {
    if (!row.receiptId) return
    try { await requestReceiptReprint(row.receiptId); setNotice(`ส่งบิล #${row.orderNumber} เข้าคิวพิมพ์แล้ว`) }
    catch (error: unknown) { setErrorMessage(errorText(error)) }
  }

  const refund = async () => {
    if (!selected) return
    try { await refundOrder(selected.orderId, refundMethod, refundReason); setShowRefund(false); setRefundReason(''); setNotice(`คืนเงินบิล #${selected.orderNumber} สำเร็จ`); await search() }
    catch (error: unknown) { setErrorMessage(errorText(error)) }
  }

  const deleteHistoryRecord = async () => {
    if (!deleteTarget || profile?.role !== 'manager') return
    setIsDeleting(true); setErrorMessage(null)
    try {
      const deletedCount = await deleteSalesHistoryOrder(deleteTarget.orderId)
      setDeleteTarget(null); setSelected(null)
      setNotice(`ลบบิล #${deleteTarget.displayOrderNumber} และข้อมูล Revision ที่เกี่ยวข้องแล้ว (${deletedCount} รายการ)`)
      await search()
    } catch (error: unknown) { setErrorMessage(errorText(error)) }
    finally { setIsDeleting(false) }
  }

  return (
    <section className="manager-page">
      <header className="sales-heading"><div><p className="eyebrow">PHASE 3</p><h2>บิลย้อนหลัง</h2></div><button className="secondary-button" disabled={isLoading} onClick={() => void search()} type="button">ค้นหาใหม่</button></header>
      <form className="history-filters content-card" onSubmit={(event) => { event.preventDefault(); void search() }}><label>ตั้งแต่<input onChange={(event) => setFrom(event.target.value)} required type="date" value={from} /></label><label>ถึง<input onChange={(event) => setTo(event.target.value)} required type="date" value={to} /></label><label>เลขที่บิล (ไม่บังคับ)<input inputMode="numeric" min="1" onChange={(event) => setOrderNumber(event.target.value)} type="number" value={orderNumber} /></label><button className="primary-button" disabled={isLoading} type="submit">ค้นหา</button></form>
      {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      {notice ? <p className="success-message" role="status">{notice}</p> : null}
      <section className="content-card history-card"><h3>รายการ ({rows.length})</h3>{isLoading ? <p className="muted">กำลังโหลด...</p> : rows.length === 0 ? <p className="muted">ไม่มีบิลในช่วงเวลาที่เลือก</p> : <><div className="history-table-wrap"><table className="history-table"><thead><tr><th>บิล</th><th>โต๊ะ</th><th>เวลา</th><th>สถานะ</th><th>ชำระโดย</th><th>สุทธิ</th><th>การทำงาน</th></tr></thead><tbody>{rows.map((row) => <tr key={row.orderId}><td>#{row.displayOrderNumber}</td><td>{row.tableName}</td><td>{row.closedAt ? new Date(row.closedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-'}</td><td><span className={`status-pill ${row.status}`}>{statusLabel(row.status)}</span></td><td>{row.paymentMethod === 'cash' ? 'เงินสด' : row.paymentMethod === 'transfer' ? 'เงินโอน' : '-'}</td><td>{formatMoney(row.total)}</td><td className="inline-actions"><button className="secondary-button" onClick={() => setSelected(row)} type="button">ดูรายละเอียด</button>{row.receiptId && row.status !== 'void' ? <button className="secondary-button" onClick={() => void printAgain(row)} type="button">ส่งพิมพ์</button> : null}{profile?.role === 'manager' && row.status === 'paid' ? <><Link className="secondary-button" to={`/บิลย้อนหลัง/${row.orderId}/แก้ไข`}>แก้ไขบิล</Link><button className="danger-button" onClick={() => { setSelected(row); setShowRefund(true) }} type="button">คืนเงิน</button></> : null}{profile?.role === 'manager' ? <button aria-label={`ลบบิล ${row.displayOrderNumber}`} className="history-delete-button" disabled={isDeleting} onClick={() => setDeleteTarget(row)} title={`ลบบิล ${row.displayOrderNumber}`} type="button"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-8 0 1 13h8l1-13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg></button> : null}</td></tr>)}</tbody></table></div><div className="pagination-actions"><button className="secondary-button" disabled={isLoading || cursorStack.length === 0} onClick={() => void previousPage()} type="button">ก่อนหน้า</button><button className="secondary-button" disabled={isLoading || !hasMore} onClick={() => void nextPage()} type="button">ถัดไป</button></div></>}</section>
      {selected && !showRefund ? <div className="modal-backdrop"><section className="dialog-card"><h3>รายละเอียดบิล #{selected.displayOrderNumber}</h3><dl className="order-totals"><div><dt>โต๊ะ</dt><dd>{selected.tableName}</dd></div><div><dt>ยอดอาหาร</dt><dd>{formatMoney(selected.subtotal)}</dd></div><div><dt>ส่วนลด</dt><dd>−{formatMoney(selected.discount)}</dd></div><div className="grand-total"><dt>สุทธิ</dt><dd>{formatMoney(selected.total)}</dd></div></dl><div className="dialog-actions">{profile?.role === 'manager' && selected.status === 'paid' ? <Link className="secondary-button" to={`/บิลย้อนหลัง/${selected.orderId}/แก้ไข`}>แก้ไขบิล</Link> : null}<button className="secondary-button" onClick={() => setSelected(null)} type="button">ปิด</button></div></section></div> : null}
      {showRefund && selected ? <div className="modal-backdrop"><section className="dialog-card"><h3>คืนเงินเต็มบิล #{selected.displayOrderNumber}</h3><p>ยอดคืน {formatMoney(selected.total)}</p><label>วิธีคืนเงิน<select onChange={(event) => setRefundMethod(event.target.value as PaymentMethod)} value={refundMethod}><option value="cash">เงินสด</option><option value="transfer">เงินโอน</option></select></label><label>เหตุผล (บังคับ)<textarea onChange={(event) => setRefundReason(event.target.value)} required value={refundReason} /></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setShowRefund(false)} type="button">ยกเลิก</button><button className="danger-button" disabled={!refundReason.trim()} onClick={() => void refund()} type="button">ยืนยันคืนเงิน</button></div></section></div> : null}
      {deleteTarget ? <div className="modal-backdrop"><section aria-modal="true" className="dialog-card" role="dialog"><h3>ลบบิล #{deleteTarget.displayOrderNumber} ถาวร?</h3><p>ข้อมูลบิล รายการอาหาร การชำระเงิน ใบเสร็จ และ Revision ที่เกี่ยวข้องจะถูกลบออกจากระบบและกู้คืนไม่ได้</p><p className="form-error">การลบนี้ไม่สามารถย้อนกลับได้</p><div className="dialog-actions"><button className="secondary-button" disabled={isDeleting} onClick={() => setDeleteTarget(null)} type="button">ยกเลิก</button><button className="danger-button" disabled={isDeleting} onClick={() => void deleteHistoryRecord()} type="button">{isDeleting ? 'กำลังลบ...' : 'ยืนยันลบถาวร'}</button></div></section></div> : null}
    </section>
  )
}
