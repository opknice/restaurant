import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { cancelReceipt, loadPrintQueue, markReceiptPrinted, requeueReceipt } from './printingApi'
import type { PrintQueueRow, PrintStatus } from './printingApi'

const labels: Record<PrintStatus, string> = { pending: 'รอพิมพ์', printing: 'กำลังพิมพ์', printed: 'พิมพ์แล้ว', failed: 'พิมพ์ไม่สำเร็จ', review_required: 'รอตรวจสอบ', cancelled: 'ยกเลิก' }
function errorText(error: unknown): string { return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ' }

export function PrintQueuePage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<PrintQueueRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (profile?.role !== 'manager') return
    setIsLoading(true); setErrorMessage(null)
    try { setRows(await loadPrintQueue()) } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsLoading(false) }
  }, [profile?.role])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])

  const runAction = async (row: PrintQueueRow, action: 'requeue' | 'printed' | 'cancel') => {
    setIsSubmitting(row.id); setErrorMessage(null); setNotice(null)
    try { if (action === 'requeue') await requeueReceipt(row.id); else if (action === 'printed') await markReceiptPrinted(row.id); else await cancelReceipt(row.id); setNotice(action === 'requeue' ? 'ส่งงานเข้าคิวใหม่แล้ว' : action === 'printed' ? 'บันทึกว่างานพิมพ์เสร็จแล้ว' : 'ยกเลิกงานพิมพ์แล้ว'); await refresh() } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsSubmitting(null) }
  }

  if (profile?.role !== 'manager') return <section className="content-card"><h2>ไม่มีสิทธิ์เข้าถึง</h2></section>
  return <section className="manager-page"><header className="sales-heading"><div><p className="eyebrow">MANAGER</p><h2>สถานะงานพิมพ์</h2></div><button className="secondary-button" disabled={isLoading} onClick={() => void refresh()} type="button">รีเฟรช</button></header>{errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}{notice ? <p className="success-message" role="status">{notice}</p> : null}<section className="content-card history-card">{isLoading ? <p className="muted">กำลังโหลด...</p> : rows.length === 0 ? <p className="muted">ไม่มีงานพิมพ์ที่ต้องตรวจสอบ</p> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>ใบเสร็จ</th><th>สถานะ</th><th>ครั้งที่ลอง</th><th>ข้อผิดพลาด</th><th>การทำงาน</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.orderId}</td><td><span className={`status-pill ${row.printStatus === 'review_required' ? 'refunded' : row.printStatus === 'printed' ? 'paid' : 'void'}`}>{labels[row.printStatus]}</span></td><td>{row.printAttempts}</td><td>{row.lastError ?? '-'}</td><td>{row.printStatus === 'failed' || row.printStatus === 'review_required' ? <div className="inline-actions"><button className="secondary-button" disabled={isSubmitting === row.id || row.printAttempts >= 3} onClick={() => void runAction(row, 'requeue')} type="button">{row.printAttempts >= 3 ? 'ครบจำนวนครั้ง' : 'ส่งพิมพ์ใหม่'}</button><button className="secondary-button" disabled={isSubmitting === row.id} onClick={() => void runAction(row, 'printed')} type="button">ยืนยันว่าพิมพ์แล้ว</button><button className="danger-button" disabled={isSubmitting === row.id} onClick={() => void runAction(row, 'cancel')} type="button">ยกเลิกงาน</button></div> : '-'}</td></tr>)}</tbody></table></div>}</section></section>
}
