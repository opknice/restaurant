import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ProductCatalog } from './ProductCatalog'
import { useProductCatalogFilters } from './useProductCatalogFilters'
import {
  addCorrectionItem,
  applyCorrectionDiscount,
  cancelOrderCorrection,
  clearCorrectionDiscount,
  finalizeOrderCorrection,
  loadOrder,
  loadOrderCorrection,
  loadActiveOrderCorrection,
  loadProducts,
  setCorrectionItemQuantity,
  setCorrectionReceiptMode,
  startOrderCorrection,
} from './salesApi'
import type { DiscountType, Order, OrderCorrectionDetail, OrderItem, PaymentMethod, Product } from './salesTypes'

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
function formatMoney(value: number): string { return money.format(value) }
function errorText(error: unknown): string { return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ' }

export function OrderCorrectionPage() {
  const { profile } = useAuth()
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [source, setSource] = useState<{ order: Order; items: OrderItem[] } | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [detail, setDetail] = useState<OrderCorrectionDetail | null>(null)
  const [reason, setReason] = useState('')
  const [discountType, setDiscountType] = useState<Exclude<DiscountType, 'none'>>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [showDiscount, setShowDiscount] = useState(false)
  const [showFinalize, setShowFinalize] = useState(false)
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash')
  const [newPaymentMethod, setNewPaymentMethod] = useState<PaymentMethod>('cash')
  const [receivedAmount, setReceivedAmount] = useState('')
  const [newTransferReference, setNewTransferReference] = useState('')
  const [refundTransferReference, setRefundTransferReference] = useState('')
  const [transferConfirmed, setTransferConfirmed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const startRequestId = useRef<string | null>(null)
  const catalogFilters = useProductCatalogFilters(products)

  const refreshDetail = useCallback(async (correctionId: string) => {
    setDetail(await loadOrderCorrection(correctionId))
  }, [])

  useEffect(() => {
    if (!orderId || profile?.role !== 'manager') return
    let active = true
    void Promise.all([loadOrder(orderId), loadProducts(), loadActiveOrderCorrection(orderId)])
      .then(([nextSource, nextProducts, activeCorrection]) => {
        if (!active) return
        setSource(nextSource)
        setProducts(nextProducts)
        setDetail(activeCorrection)
      })
      .catch((error: unknown) => { if (active) setErrorMessage(errorText(error)) })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [orderId, profile?.role])

  const mutate = useCallback(async (operation: () => Promise<unknown>) => {
    if (!detail) return
    setIsBusy(true); setErrorMessage(null)
    try {
      await operation()
      await refreshDetail(detail.correction.id)
    } catch (error: unknown) {
      setErrorMessage(errorText(error))
    } finally { setIsBusy(false) }
  }, [detail, refreshDetail])

  const start = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!orderId || !reason.trim()) return
    setIsBusy(true); setErrorMessage(null)
    try {
      const requestId = startRequestId.current ?? crypto.randomUUID()
      startRequestId.current = requestId
      const correction = await startOrderCorrection(orderId, reason.trim(), requestId)
      startRequestId.current = null
      await refreshDetail(correction.id)
    } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsBusy(false) }
  }

  const submitDiscount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail) return
    void mutate(async () => {
      await applyCorrectionDiscount(detail.correction.id, discountType, Number(discountValue), discountReason.trim())
      setShowDiscount(false); setDiscountValue(''); setDiscountReason('')
    })
  }

  const finalize = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail) return
    if (newPaymentMethod === 'transfer' && !transferConfirmed) return
    setIsBusy(true); setErrorMessage(null)
    try {
      await finalizeOrderCorrection(
        detail.correction.id,
        refundMethod,
        newPaymentMethod,
        newPaymentMethod === 'transfer' ? detail.correction.total : Number(receivedAmount),
        newTransferReference,
        refundTransferReference,
        transferConfirmed,
      )
      navigate('/บิลย้อนหลัง', { replace: true })
    } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsBusy(false) }
  }

  const correctionCartQuantityByProductId = useMemo(() => new Map(detail?.items.map((item) => [item.productId, item.quantity]) ?? []), [detail?.items])
  if (profile?.role !== 'manager') return null
  if (isLoading) return <main className="page-feedback">กำลังโหลดบิล...</main>
  if (!source) return <section className="manager-page"><p className="form-error" role="alert">{errorMessage ?? 'ไม่พบข้อมูลบิล'}</p></section>

  return (
    <section className="manager-page correction-page">
      <header className="sales-heading">
        <div><p className="eyebrow">MANAGER · แก้ไขบิลย้อนหลัง</p><h2>บิล #{source.order.orderNumber}{detail ? `-R${detail.correction.revisionNo}` : ''}</h2></div>
        <button className="secondary-button" disabled={isBusy} onClick={() => navigate('/บิลย้อนหลัง')} type="button">กลับบิลย้อนหลัง</button>
      </header>
      {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}

      {!detail ? <section className="content-card correction-start-card correction-start-panel">
        <div className="correction-start-heading"><div><span className="pos-filter-kicker">ขั้นตอนที่ 1</span><h3>เริ่มแก้ไขบิลที่ชำระแล้ว</h3></div><span className="correction-start-icon" aria-hidden="true">✎</span></div>
        <p className="muted">ระบบจะคืนเงินบิลเดิมเต็มจำนวน และสร้างบิล Revision ใหม่เมื่อกดยืนยันขั้นสุดท้าย</p>
        <dl className="order-totals"><div><dt>ยอดเดิม</dt><dd>{formatMoney(source.order.total)}</dd></div><div><dt>รายการเดิม</dt><dd>{source.items.length} รายการ</dd></div></dl>
        <form className="compact-form" onSubmit={start}>
          <label className="pos-form-label"><span>เหตุผลการแก้ไข (บังคับ)</span><textarea className="pos-touch-textarea" onChange={(event) => setReason(event.target.value)} placeholder="เช่น คีย์รายการผิด หรือคิดเงินไม่ครบ" required rows={4} value={reason} /></label>
          <div className="dialog-actions"><button className="secondary-touch-button" onClick={() => navigate('/บิลย้อนหลัง')} type="button">ยกเลิก</button><button className="primary-touch-button" disabled={isBusy || !reason.trim()} type="submit">สร้าง Draft แก้ไข</button></div>
        </form>
      </section> : <>
        <section className="correction-draft-banner"><strong>Draft ยังไม่กระทบยอดเงินจริง</strong><span>แก้ไขเสร็จแล้วจึงยืนยันการคืนเงินและชำระใหม่</span><button className="danger-button" disabled={isBusy} onClick={() => void mutate(() => cancelOrderCorrection(detail.correction.id).then(() => { navigate('/บิลย้อนหลัง', { replace: true }) }))} type="button">ยกเลิก Draft</button></section>
        <div className="pos-main-container correction-pos-container">
          <section aria-label="รายการอาหารและเครื่องดื่ม" className="pos-catalog-section correction-catalog">
            <div className="correction-section-heading"><div><span className="pos-filter-kicker">แก้ไขรายการ</span><h3>เพิ่มรายการอาหาร</h3></div><span className="muted">เลือกเมนูเพื่อเพิ่มลงบิลใหม่</span></div>
            <ProductCatalog
              cartQuantityByProductId={correctionCartQuantityByProductId}
              filters={catalogFilters}
              isSubmitting={isBusy}
              onAddProduct={(productId) => void mutate(() => addCorrectionItem(detail.correction.id, productId))}
            />
          </section>
          <aside aria-label="รายการใหม่ในบิลแก้ไข" className="pos-cart-panel correction-editor-panel">
            <div className="pos-cart-header"><div><h3>รายการใหม่</h3><span className="muted">Revision {detail.correction.revisionNo}</span></div></div>
            <label className="correction-select">รูปแบบใบเสร็จ<select disabled={isBusy} onChange={(event) => void mutate(() => setCorrectionReceiptMode(detail.correction.id, event.target.value as 'shop' | 'field'))} value={detail.correction.receiptMode}><option value="shop">ใบแบบร้าน</option><option value="field">ใบแบบสนาม</option></select></label>
            <div className="cart-items-scroll">
              {detail.items.length === 0 ? <div className="cart-empty-box"><p>ยังไม่มีรายการอาหาร</p><span className="muted">เลือกเมนูจากด้านซ้ายเพื่อเพิ่มรายการ</span></div> : detail.items.map((item) => <div className="cart-item-row" key={item.id}>
                <div className="cart-item-info"><strong>{item.productName}</strong><span>{formatMoney(item.unitPrice)} / รายการ</span></div>
                <div className="cart-quantity-group"><button aria-label={`ลด ${item.productName}`} className="quantity-touch-btn" disabled={isBusy} onClick={() => void mutate(() => setCorrectionItemQuantity(item.id, item.quantity - 1))} type="button">−</button><span className="quantity-value">{item.quantity}</span><button aria-label={`เพิ่ม ${item.productName}`} className="quantity-touch-btn" disabled={isBusy} onClick={() => void mutate(() => setCorrectionItemQuantity(item.id, item.quantity + 1))} type="button">+</button></div>
                <div className="cart-line-total"><strong>{formatMoney(item.lineTotal)}</strong></div>
                <button aria-label={`ลบ ${item.productName} ออกจากบิลแก้ไข`} className="cart-remove-button" disabled={isBusy} onClick={() => void mutate(() => setCorrectionItemQuantity(item.id, 0))} title={`ลบ ${item.productName}`} type="button"><svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-8 0 1 13h8l1-13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg></button>
              </div>)}
            </div>
            <div className="cart-totals-area">
              {detail.correction.discount > 0 ? <p className="success-message">ส่วนลด {formatMoney(detail.correction.discount)}{detail.correction.discountReason ? ` · ${detail.correction.discountReason}` : ''}</p> : null}
              <div className="total-row"><span>ยอดอาหาร</span><span>{formatMoney(detail.correction.subtotal)}</span></div>
              <div className="total-row discount"><span>ส่วนลด</span><span>−{formatMoney(detail.correction.discount)}</span></div>
              <div className="total-row grand"><span>ยอดใหม่</span><strong>{formatMoney(detail.correction.total)}</strong></div>
              <div className="cart-sub-actions"><button className="small-action-btn" disabled={isBusy} onClick={() => setShowDiscount(true)} type="button">% ส่วนลด</button>{detail.correction.discount > 0 ? <button className="small-action-btn" disabled={isBusy} onClick={() => void mutate(() => clearCorrectionDiscount(detail.correction.id))} type="button">ล้างส่วนลด</button> : null}</div>
              <button className="checkout-primary-button" disabled={isBusy || detail.items.length === 0 || detail.correction.total <= 0} onClick={() => setShowFinalize(true)} type="button">ตรวจยอดและยืนยัน</button>
            </div>
          </aside>
        </div>
      </>}

      {showDiscount && detail ? <div className="modal-backdrop"><form className="dialog-card" onSubmit={submitDiscount}><h3>แก้ส่วนลดบิลใหม่</h3><label>ประเภท<select onChange={(event) => setDiscountType(event.target.value as Exclude<DiscountType, 'none'>)} value={discountType}><option value="percent">เปอร์เซ็นต์</option><option value="fixed">จำนวนเงิน</option></select></label><label>{discountType === 'percent' ? 'เปอร์เซ็นต์ (1–100)' : 'จำนวนเงิน'}<input inputMode="decimal" min="0.01" onChange={(event) => setDiscountValue(event.target.value)} required step="0.01" type="number" value={discountValue} /></label><label>เหตุผล (บังคับ)<textarea onChange={(event) => setDiscountReason(event.target.value)} required value={discountReason} /></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setShowDiscount(false)} type="button">ยกเลิก</button><button className="primary-button" disabled={isBusy} type="submit">บันทึก</button></div></form></div> : null}
      {showFinalize && detail ? <div className="modal-backdrop"><form className="dialog-card" onSubmit={finalize}><h3>ยืนยันแก้ไขบิล #{source.order.orderNumber}</h3><p>คืนเงินบิลเดิมเต็มจำนวน <strong>{formatMoney(source.order.total)}</strong></p><p>ชำระบิลใหม่เต็มจำนวน <strong>{formatMoney(detail.correction.total)}</strong></p><label>วิธีคืนเงิน<select onChange={(event) => setRefundMethod(event.target.value as PaymentMethod)} value={refundMethod}><option value="cash">เงินสด</option><option value="transfer">เงินโอน</option></select></label>{refundMethod === 'transfer' ? <label>เลขอ้างอิงการคืนเงิน (ไม่บังคับ)<input onChange={(event) => setRefundTransferReference(event.target.value)} value={refundTransferReference} /></label> : null}<label>วิธีชำระบิลใหม่<select onChange={(event) => { setNewPaymentMethod(event.target.value as PaymentMethod); setTransferConfirmed(false) }} value={newPaymentMethod}><option value="cash">เงินสด</option><option value="transfer">เงินโอน</option></select></label>{newPaymentMethod === 'cash' ? <label>รับเงินบิลใหม่<input autoFocus inputMode="decimal" min={detail.correction.total} onChange={(event) => setReceivedAmount(event.target.value)} required step="0.01" type="number" value={receivedAmount} /></label> : <><label>เลขอ้างอิงการโอน (ไม่บังคับ)<input onChange={(event) => setNewTransferReference(event.target.value)} value={newTransferReference} /></label><label className="confirmation-check"><input checked={transferConfirmed} onChange={(event) => setTransferConfirmed(event.target.checked)} required type="checkbox" />ยืนยันว่าได้รับเงินโอนบิลใหม่แล้ว</label></>}<div className="dialog-actions"><button className="secondary-button" disabled={isBusy} onClick={() => setShowFinalize(false)} type="button">กลับไปแก้</button><button className="danger-button" disabled={isBusy || (newPaymentMethod === 'transfer' && !transferConfirmed)} type="submit">คืนเงินและชำระใหม่</button></div></form></div> : null}
    </section>
  )
}
