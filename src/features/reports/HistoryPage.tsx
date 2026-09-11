import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { refundOrder, requestReceiptPrint } from '../sales/salesApi'
import type { PaymentMethod } from '../sales/salesTypes'
import { loadHistory } from './reportsApi'
import { todayInBangkok, toBangkokEnd, toBangkokStart } from './dateRange'
import type { HistoryRow } from './reportTypes'

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
function formatMoney(value: number) { return money.format(value) }
function statusLabel(status: HistoryRow['status']) { return ({ paid: 'ชำระแล้ว', refunded: 'คืนเงินแล้ว', void: 'ยกเลิก', open: 'ค้างชำระ' })[status] }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ' }

export function HistoryPage() {
  const { profile } = useAuth()
  const [from, setFrom] = useState(todayInBangkok())
  const [to, setTo] = useState(todayInBangkok())
  const [orderNumber, setOrderNumber] = useState('')
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [selected, setSelected] = useState<HistoryRow | null>(null)
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash')
  const [refundReason, setRefundReason] = useState('')
  const [showRefund, setShowRefund] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const search = useCallback(async () => {
    setIsLoading(true); setErrorMessage(null); setNotice(null)
    try { setRows(await loadHistory(toBangkokStart(from), toBangkokEnd(to), orderNumber ? Number(orderNumber) : null)) }
    catch (error: unknown) { setErrorMessage(errorText(error)) }
    finally { setIsLoading(false) }
  }, [from, orderNumber, to])
  useEffect(() => { void Promise.resolve().then(search) }, [search])

  const printAgain = async (row: HistoryRow) => {
    if (!row.receiptId) return
    try { await requestReceiptPrint(row.receiptId); setNotice(`ส่งบิล #${row.orderNumber} เข้าคิวพิมพ์แล้ว`) }
    catch (error: unknown) { setErrorMessage(errorText(error)) }
  }

  const refund = async () => {
    if (!selected) return
    try { await refundOrder(selected.orderId, refundMethod, refundReason); setShowRefund(false); setRefundReason(''); setNotice(`คืนเงินบิล #${selected.orderNumber} สำเร็จ`); await search() }
    catch (error: unknown) { setErrorMessage(errorText(error)) }
  }

  return <section className="manager-page"><header className="sales-heading"><div><p className="eyebrow">PHASE 3</p><h2>บิลย้อนหลัง</h2></div><button className="secondary-button" onClick={() => void search()} type="button">ค้นหาใหม่</button></header><form className="history-filters content-card" onSubmit={(event) => { event.preventDefault(); void search() }}><label>ตั้งแต่<input onChange={(event) => setFrom(event.target.value)} required type="date" value={from} /></label><label>ถึง<input onChange={(event) => setTo(event.target.value)} required type="date" value={to} /></label><label>เลขที่บิล (ไม่บังคับ)<input inputMode="numeric" min="1" onChange={(event) => setOrderNumber(event.target.value)} type="number" value={orderNumber} /></label><button className="primary-button" type="submit">ค้นหา</button></form>{errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}{notice ? <p className="success-message" role="status">{notice}</p> : null}<section className="content-card history-card"><h3>รายการ ({rows.length})</h3>{isLoading ? <p className="muted">กำลังโหลด...</p> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>บิล</th><th>โต๊ะ</th><th>เวลา</th><th>สถานะ</th><th>ชำระโดย</th><th>สุทธิ</th><th>การทำงาน</th></tr></thead><tbody>{rows.map((row) => <tr key={row.orderId}><td>#{row.orderNumber}</td><td>{row.tableName}</td><td>{row.closedAt ? new Date(row.closedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-'}</td><td><span className={`status-pill ${row.status}`}>{statusLabel(row.status)}</span></td><td>{row.paymentMethod === 'cash' ? 'เงินสด' : row.paymentMethod === 'transfer' ? 'เงินโอน' : '-'}</td><td>{formatMoney(row.total)}</td><td className="inline-actions"><button className="secondary-button" onClick={() => setSelected(row)} type="button">ดูรายละเอียด</button>{row.receiptId && row.status !== 'void' ? <button className="secondary-button" onClick={() => void printAgain(row)} type="button">ส่งพิมพ์</button> : null}{profile?.role === 'manager' && row.status === 'paid' ? <button className="danger-button" onClick={() => { setSelected(row); setShowRefund(true) }} type="button">คืนเงิน</button> : null}</td></tr>)}</tbody></table></div>}</section>{selected && !showRefund ? <div className="modal-backdrop"><section className="dialog-card"><h3>รายละเอียดบิล #{selected.orderNumber}</h3><dl className="order-totals"><div><dt>โต๊ะ</dt><dd>{selected.tableName}</dd></div><div><dt>ยอดอาหาร</dt><dd>{formatMoney(selected.subtotal)}</dd></div><div><dt>ส่วนลด</dt><dd>−{formatMoney(selected.discount)}</dd></div><div className="grand-total"><dt>สุทธิ</dt><dd>{formatMoney(selected.total)}</dd></div></dl><div className="dialog-actions"><button className="secondary-button" onClick={() => setSelected(null)} type="button">ปิด</button></div></section></div> : null}{showRefund && selected ? <div className="modal-backdrop"><section className="dialog-card"><h3>คืนเงินเต็มบิล #{selected.orderNumber}</h3><p>ยอดคืน {formatMoney(selected.total)}</p><label>วิธีคืนเงิน<select onChange={(event) => setRefundMethod(event.target.value as PaymentMethod)} value={refundMethod}><option value="cash">เงินสด</option><option value="transfer">เงินโอน</option></select></label><label>เหตุผล (บังคับ)<textarea onChange={(event) => setRefundReason(event.target.value)} required value={refundReason} /></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setShowRefund(false)} type="button">ยกเลิก</button><button className="danger-button" disabled={!refundReason.trim()} onClick={() => void refund()} type="button">ยืนยันคืนเงิน</button></div></section></div> : null}</section>
}
