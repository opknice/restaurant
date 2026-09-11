import { useCallback, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { useConnectivity } from '../../hooks/useConnectivity'
import { addItem, applyDiscount, checkoutOrder, clearDiscount, createOrder, requestReceiptPrint, setItemQuantity, setReceiptMode, voidOrder } from './salesApi'
import type { PaymentMethod, ReceiptMode, ReceiptResult } from './salesTypes'
import { useSalesWorkspace } from './useSalesWorkspace'

const currencyFormatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })

function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่'
}

export function SalesPage() {
  const { profile } = useAuth()
  const isOnline = useConnectivity()
  const workspace = useSalesWorkspace()
  const [categoryFilter, setCategoryFilter] = useState('ทั้งหมด')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [receivedAmount, setReceivedAmount] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [transferConfirmed, setTransferConfirmed] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null)

  const categories = useMemo(() => ['ทั้งหมด', ...new Set(workspace.products.map((product) => product.categoryName))], [workspace.products])
  const visibleProducts = useMemo(
    () => workspace.products.filter((product) => categoryFilter === 'ทั้งหมด' || product.categoryName === categoryFilter),
    [categoryFilter, workspace.products],
  )
  const cashReceived = Number(receivedAmount)
  const estimatedChange = workspace.order && paymentMethod === 'cash' && Number.isFinite(cashReceived)
    ? Math.max(0, cashReceived - workspace.order.total)
    : 0

  const perform = useCallback(async (operation: () => Promise<void>) => {
    setIsSubmitting(true)
    workspace.setErrorMessage(null)
    if (!isOnline) {
      workspace.setErrorMessage('ไม่มีอินเทอร์เน็ต ไม่สามารถทำรายการได้')
      setIsSubmitting(false)
      return
    }
    try {
      await operation()
    } catch (error: unknown) {
      workspace.setErrorMessage(readableError(error))
    } finally {
      setIsSubmitting(false)
    }
  }, [isOnline, workspace])

  const handleOpenOrder = () => {
    if (!workspace.selectedTable) return
    void perform(async () => {
      const nextOrder = await createOrder(workspace.selectedTable!.id)
      await workspace.refreshOrder(nextOrder.id)
      await workspace.refreshAll()
    })
  }

  const handleAddProduct = (productId: string) => {
    if (!workspace.order) return
    void perform(async () => {
      await addItem(workspace.order!.id, productId)
      await workspace.refreshOrder(workspace.order!.id)
    })
  }

  const handleQuantity = (itemId: string, nextQuantity: number) => {
    if (!workspace.order) return
    void perform(async () => {
      await setItemQuantity(itemId, nextQuantity)
      await workspace.refreshOrder(workspace.order!.id)
    })
  }

  const handleReceiptMode = (mode: ReceiptMode) => {
    if (!workspace.order) return
    void perform(async () => {
      await setReceiptMode(workspace.order!.id, mode)
      await workspace.refreshOrder(workspace.order!.id)
    })
  }

  const submitDiscount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!workspace.order) return
    const value = Number(discountValue)
    void perform(async () => {
      await applyDiscount(workspace.order!.id, discountType, value, discountReason)
      await workspace.refreshOrder(workspace.order!.id)
      setShowDiscount(false)
      setDiscountValue('')
      setDiscountReason('')
    })
  }

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!workspace.order) return
    const amount = paymentMethod === 'transfer' ? workspace.order.total : Number(receivedAmount)
    void perform(async () => {
      const result = await checkoutOrder(workspace.order!.id, paymentMethod, amount, transferReference)
      setReceipt(result)
      setShowCheckout(false)
      setReceivedAmount('')
      setTransferReference('')
      setTransferConfirmed(false)
      workspace.setOrder(null)
      workspace.setItems([])
      await workspace.refreshAll()
    })
  }

  const handleVoid = () => {
    if (!workspace.order) return
    const reason = window.prompt('ระบุเหตุผลการยกเลิกบิล')?.trim()
    if (!reason) return
    void perform(async () => {
      await voidOrder(workspace.order!.id, reason)
      workspace.setOrder(null)
      workspace.setItems([])
      await workspace.refreshAll()
    })
  }

  const handleRequestPrint = () => {
    if (!receipt) return
    void perform(async () => {
      await requestReceiptPrint(receipt.receiptId)
      workspace.setErrorMessage(null)
    })
  }

  return (
    <section className="sales-page" aria-label="ขายหน้าร้าน">
      <header className="sales-heading">
        <div><p className="eyebrow">PHASE 2 · ขายหน้าร้าน</p><h2>เปิดโต๊ะและรับรายการอาหาร</h2></div>
        <button className="secondary-button" disabled={workspace.isLoading || isSubmitting} onClick={() => void workspace.refreshAll()} type="button">รีเฟรช</button>
      </header>
      {workspace.errorMessage ? <p className="form-error" role="alert">{workspace.errorMessage}</p> : null}
      {receipt ? <section className="receipt-notice"><strong>ชำระบิล #{receipt.orderNumber} สำเร็จ</strong><span>{receipt.paymentMethod === 'cash' ? `เงินทอน ${formatCurrency(receipt.changeAmount)}` : 'เงินโอน'}</span><span>สร้างใบเสร็จเรียบร้อยแล้ว</span><button className="primary-button" disabled={isSubmitting} onClick={handleRequestPrint} type="button">ส่งงานพิมพ์</button><button className="secondary-button" onClick={() => setReceipt(null)} type="button">ปิด</button></section> : null}

      <div className="sales-layout">
        <section className="sales-panel table-panel" aria-labelledby="table-heading">
          <h3 id="table-heading">โต๊ะ ({workspace.tables.length}/20)</h3>
          <div className="table-grid">
            {workspace.tables.map((table) => (
              <button className={`table-button ${workspace.selectedTable?.id === table.id ? 'selected' : ''} ${table.hasOpenOrder ? 'occupied' : ''}`} key={table.id} onClick={() => void workspace.chooseTable(table)} type="button">
                <strong>{table.displayName}</strong>
                <span>{table.hasOpenOrder ? (table.isOwnedByCurrentUser ? 'บิลของคุณ' : 'กำลังใช้งาน') : 'ว่าง'}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sales-panel catalog-panel" aria-labelledby="catalog-heading">
          <h3 id="catalog-heading">รายการอาหาร</h3>
          <div className="category-tabs">{categories.map((category) => <button className={categoryFilter === category ? 'active' : ''} key={category} onClick={() => setCategoryFilter(category)} type="button">{category}</button>)}</div>
          {workspace.products.length === 0 ? <p className="muted">ยังไม่มีสินค้า กรุณาให้ manager เพิ่มสินค้าในเมนูสินค้า</p> : null}
          <div className="product-grid">{visibleProducts.map((product) => <button className="product-card" disabled={!workspace.order || isSubmitting} key={product.id} onClick={() => handleAddProduct(product.id)} type="button"><span>{product.name}</span><strong>{formatCurrency(product.price)}</strong></button>)}</div>
        </section>

        <section className="sales-panel order-panel" aria-labelledby="order-heading">
          <h3 id="order-heading">{workspace.selectedTable ? workspace.selectedTable.displayName : 'เลือกโต๊ะก่อน'}</h3>
          {!workspace.order && workspace.selectedTable && !workspace.selectedTable.hasOpenOrder ? <button className="primary-button full-width" disabled={isSubmitting} onClick={handleOpenOrder} type="button">เปิดบิล</button> : null}
          {!workspace.order && workspace.selectedTable?.hasOpenOrder ? <p className="muted">บิลนี้เป็นของผู้ใช้งานคนอื่น หรือคุณไม่มีสิทธิ์เปิดดู</p> : null}
          {workspace.order ? <>
            <div className="order-meta"><span>บิล #{workspace.order.orderNumber}</span><select aria-label="รูปแบบใบเสร็จ" disabled={isSubmitting} onChange={(event) => handleReceiptMode(event.target.value as ReceiptMode)} value={workspace.order.receiptMode}><option value="shop">ใบแบบร้าน</option><option value="field">ใบแบบสนาม</option></select></div>
            <div className="order-items">{workspace.items.map((item) => <article className="order-item" key={item.id}><div><strong>{item.productName}</strong><span>{formatCurrency(item.unitPrice)} / รายการ</span></div><div className="quantity-control"><button aria-label={`ลด ${item.productName}`} disabled={isSubmitting} onClick={() => handleQuantity(item.id, item.quantity - 1)} type="button">−</button><span>{item.quantity}</span><button aria-label={`เพิ่ม ${item.productName}`} disabled={isSubmitting} onClick={() => handleQuantity(item.id, item.quantity + 1)} type="button">+</button></div><strong>{formatCurrency(item.lineTotal)}</strong></article>)}</div>
            <dl className="order-totals"><div><dt>ยอดอาหาร</dt><dd>{formatCurrency(workspace.order.subtotal)}</dd></div>{workspace.order.discount > 0 ? <div><dt>ส่วนลด</dt><dd>−{formatCurrency(workspace.order.discount)}</dd></div> : null}<div className="grand-total"><dt>สุทธิ</dt><dd>{formatCurrency(workspace.order.total)}</dd></div></dl>
            <div className="order-actions">{profile?.role === 'manager' ? <><button className="secondary-button" disabled={isSubmitting} onClick={() => setShowDiscount(true)} type="button">ส่วนลด</button>{workspace.order.discount > 0 ? <button className="secondary-button" disabled={isSubmitting} onClick={() => void perform(async () => { await clearDiscount(workspace.order!.id); await workspace.refreshOrder(workspace.order!.id) })} type="button">ยกเลิกส่วนลด</button> : null}<button className="danger-button" disabled={isSubmitting} onClick={handleVoid} type="button">ยกเลิกบิล</button></> : null}<button className="primary-button" disabled={isSubmitting || workspace.items.length === 0} onClick={() => setShowCheckout(true)} type="button">เช็กบิล</button></div>
          </> : null}
        </section>
      </div>

      {showDiscount && workspace.order ? <div className="modal-backdrop"><form className="dialog-card" onSubmit={submitDiscount}><h3>กำหนดส่วนลด</h3><label>ประเภท<select onChange={(event) => setDiscountType(event.target.value as 'percent' | 'fixed')} value={discountType}><option value="percent">เปอร์เซ็นต์</option><option value="fixed">จำนวนเงิน</option></select></label><label>{discountType === 'percent' ? 'เปอร์เซ็นต์ (1–100)' : 'จำนวนเงิน'}<input inputMode="decimal" min="0.01" onChange={(event) => setDiscountValue(event.target.value)} required step="0.01" type="number" value={discountValue} /></label><label>เหตุผล (บังคับ)<textarea onChange={(event) => setDiscountReason(event.target.value)} required value={discountReason} /></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setShowDiscount(false)} type="button">ยกเลิก</button><button className="primary-button" disabled={isSubmitting} type="submit">บันทึกส่วนลด</button></div></form></div> : null}
      {showCheckout && workspace.order ? <div className="modal-backdrop"><form className="dialog-card" onSubmit={submitCheckout}><h3>เช็กบิล #{workspace.order.orderNumber}</h3><p className="checkout-total">ยอดชำระ {formatCurrency(workspace.order.total)}</p><fieldset><legend>วิธีชำระเงิน</legend><label><input checked={paymentMethod === 'cash'} name="payment-method" onChange={() => setPaymentMethod('cash')} type="radio" /> เงินสด</label><label><input checked={paymentMethod === 'transfer'} name="payment-method" onChange={() => setPaymentMethod('transfer')} type="radio" /> เงินโอน</label></fieldset>{paymentMethod === 'cash' ? <><label>รับเงินมา<input autoFocus inputMode="decimal" min={workspace.order.total} onChange={(event) => setReceivedAmount(event.target.value)} required step="0.01" type="number" value={receivedAmount} /></label><div className="cash-shortcuts">{[20, 50, 100, 500, 1000].map((amount) => <button className="secondary-button" key={amount} onClick={() => setReceivedAmount(String(amount))} type="button">{amount}</button>)}<button className="secondary-button" onClick={() => setReceivedAmount(String(workspace.order!.total))} type="button">พอดี</button></div><p className="change-preview">เงินทอน: {formatCurrency(estimatedChange)}</p></> : <><label>เลขอ้างอิงการโอน (ไม่บังคับ)<input onChange={(event) => setTransferReference(event.target.value)} value={transferReference} /></label><label className="confirmation-check"><input checked={transferConfirmed} onChange={(event) => setTransferConfirmed(event.target.checked)} required type="checkbox" />ยืนยันว่าได้รับเงินโอนแล้ว</label></>}<div className="dialog-actions"><button className="secondary-button" onClick={() => setShowCheckout(false)} type="button">กลับ</button><button className="primary-button" disabled={isSubmitting} type="submit">ยืนยันชำระเงิน</button></div></form></div> : null}
    </section>
  )
}
