import { supabase } from '../../lib/supabase'
import type { CorrectionStatus, DiscountType, Order, OrderCorrection, OrderCorrectionDetail, OrderCorrectionItem, OrderItem, PaymentMethod, Product, ReceiptMode, ReceiptPreview, ReceiptResult, SalesTable } from './salesTypes'

interface TableRpcRow {
  readonly display_name: string
  readonly has_open_order: boolean
  readonly id: string
  readonly is_owned_by_current_user: boolean
  readonly open_order_id: string | null
  readonly table_number: string
}

interface ProductRow {
  readonly category_id: string
  readonly group_name: string | null
  readonly id: string
  readonly is_favorite: boolean
  readonly name: string
  readonly price: number | string
  readonly categories: { readonly name: string } | null
  readonly product_subcategories: readonly {
    readonly subcategory_id: string
    readonly subcategories: { readonly id: string; readonly name: string } | null
  }[] | null
}

interface OrderRow {
  readonly discount: number | string
  readonly discount_type: DiscountType
  readonly discount_value: number | string
  readonly id: string
  readonly order_number: number
  readonly receipt_mode: ReceiptMode
  readonly status: Order['status']
  readonly subtotal: number | string
  readonly table_id: string
  readonly total: number | string
}

interface ItemRow {
  readonly id: string
  readonly product_id: string | null
  readonly line_total: number | string
  readonly product_name_snapshot: string
  readonly quantity: number | string
  readonly unit_price: number | string
}

interface CheckoutPayload {
  readonly order: OrderRow
  readonly payment: {
    readonly change_amount: number | string
    readonly method: PaymentMethod
    readonly received_amount: number | string
  }
  readonly receipt: { readonly id: string }
}

interface CorrectionRow {
  readonly id: string
  readonly source_order_id: string
  readonly root_order_id: string
  readonly replacement_order_id: string | null
  readonly revision_no: number
  readonly status: CorrectionStatus
  readonly reason: string
  readonly table_id: string | null
  readonly receipt_mode: ReceiptMode
  readonly discount_type: DiscountType
  readonly discount_value: number | string
  readonly discount_reason: string | null
  readonly subtotal: number | string
  readonly discount: number | string
  readonly total: number | string
  readonly business_at: string
}

interface CorrectionItemRow {
  readonly id: string
  readonly product_id: string | null
  readonly product_name_snapshot: string
  readonly unit_price: number | string
  readonly quantity: number | string
  readonly line_total: number | string
}

interface CorrectionResultPayload {
  readonly correction: CorrectionRow
  readonly source_order: OrderRow
  readonly replacement_order: OrderRow
  readonly payment: { readonly method: PaymentMethod; readonly received_amount: number | string; readonly change_amount: number | string }
  readonly receipt: { readonly id: string; readonly payload?: { readonly display_order_number?: string } }
}

interface ReceiptPreviewPayload {
  readonly mode: ReceiptMode
  readonly order_number: number
  readonly opened_at: string
  readonly store: { readonly store_name?: string; readonly phone?: string | null; readonly receipt_footer?: string | null; readonly payment_qr_path?: string | null; readonly bank_payment_label?: string | null; readonly bank_account_name?: string | null; readonly bank_account_number?: string | null; readonly bank_reference?: string | null }
  readonly table: { readonly name?: string }
  readonly items: readonly { readonly name: string; readonly unit_price: number | string; readonly quantity: number | string; readonly line_total: number | string }[]
  readonly subtotal: number | string
  readonly discount: number | string
  readonly total: number | string
}

let productsRequest: Promise<Product[]> | null = null

export function invalidateProductsCache(): void {
  productsRequest = null
}

function getClient() {
  if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase')
  return supabase
}

function asNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value)
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    tableId: row.table_id,
    status: row.status,
    receiptMode: row.receipt_mode,
    subtotal: asNumber(row.subtotal),
    discountType: row.discount_type,
    discountValue: asNumber(row.discount_value),
    discount: asNumber(row.discount),
    total: asNumber(row.total),
  }
}

function toCorrection(row: CorrectionRow): OrderCorrection {
  return {
    id: row.id,
    sourceOrderId: row.source_order_id,
    rootOrderId: row.root_order_id,
    replacementOrderId: row.replacement_order_id,
    revisionNo: row.revision_no,
    status: row.status,
    reason: row.reason,
    tableId: row.table_id,
    receiptMode: row.receipt_mode,
    discountType: row.discount_type,
    discountValue: asNumber(row.discount_value),
    discountReason: row.discount_reason,
    subtotal: asNumber(row.subtotal),
    discount: asNumber(row.discount),
    total: asNumber(row.total),
    businessAt: row.business_at,
  }
}

function toReceiptPreview(payload: ReceiptPreviewPayload): ReceiptPreview {
  return {
    mode: payload.mode,
    orderNumber: payload.order_number,
    openedAt: payload.opened_at,
    store: {
      storeName: payload.store.store_name ?? 'ร้านอาหาร', phone: payload.store.phone ?? null, receiptFooter: payload.store.receipt_footer ?? null,
      paymentQrPath: payload.store.payment_qr_path ?? null, bankPaymentLabel: payload.store.bank_payment_label ?? null,
      bankAccountName: payload.store.bank_account_name ?? null, bankAccountNumber: payload.store.bank_account_number ?? null, bankReference: payload.store.bank_reference ?? null,
    },
    tableName: payload.table.name ?? 'ไม่ระบุโต๊ะ',
    items: payload.items.map((item, index): OrderItem => ({ id: `preview-${index}`, productId: null, productName: item.name, unitPrice: asNumber(item.unit_price), quantity: asNumber(item.quantity), lineTotal: asNumber(item.line_total) })),
    subtotal: asNumber(payload.subtotal), discount: asNumber(payload.discount), total: asNumber(payload.total),
  }
}

export async function loadSalesTables(): Promise<SalesTable[]> {
  const { data, error } = await getClient().rpc('list_sales_tables')
  if (error) throw error
  return (data as unknown as readonly TableRpcRow[]).map((row) => ({
    id: row.id,
    tableNumber: row.table_number,
    displayName: row.display_name,
    hasOpenOrder: row.has_open_order,
    openOrderId: row.open_order_id,
    isOwnedByCurrentUser: row.is_owned_by_current_user,
  }))
}

export async function loadProducts(): Promise<Product[]> {
  if (productsRequest) return productsRequest
  productsRequest = (async () => {
  const { data, error } = await getClient()
    .from('products')
    .select('id, name, price, category_id, group_name, is_favorite, categories!inner(name), product_subcategories(subcategory_id, subcategories(id, name))')
    .eq('active', true)
    .eq('categories.active', true)
    .order('name')
  if (error) throw error
  const products = (data as unknown as readonly ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    price: asNumber(row.price),
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? 'ไม่ระบุหมวดหมู่',
    groupName: row.group_name?.trim() || null,
    isFavorite: row.is_favorite,
    subcategories: (row.product_subcategories ?? [])
      .flatMap((link) => link.subcategories ? [{ id: link.subcategories.id, name: link.subcategories.name }] : []),
  }))
  return products
  })()
  try { return await productsRequest } finally { productsRequest = null }
}

export async function loadOrder(orderId: string): Promise<{ order: Order; items: OrderItem[] }> {
  const client = getClient()
  const [{ data: orderData, error: orderError }, { data: itemsData, error: itemsError }] = await Promise.all([
    client.from('orders').select('id, order_number, table_id, status, receipt_mode, subtotal, discount_type, discount_value, discount, total').eq('id', orderId).single(),
    client.from('order_items').select('id, product_id, product_name_snapshot, unit_price, quantity, line_total').eq('order_id', orderId).order('created_at'),
  ])
  if (orderError) throw orderError
  if (itemsError) throw itemsError
  return {
    order: toOrder(orderData as unknown as OrderRow),
    items: (itemsData as unknown as readonly ItemRow[]).map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name_snapshot,
      unitPrice: asNumber(row.unit_price),
      quantity: asNumber(row.quantity),
      lineTotal: asNumber(row.line_total),
    })),
  }
}

export async function createOrder(tableId: string): Promise<Order> {
  const { data, error } = await getClient().rpc('create_order', { p_table_id: tableId, p_receipt_mode: 'shop' })
  if (error) throw error
  return toOrder(data as unknown as OrderRow)
}

export async function addItem(orderId: string, productId: string): Promise<void> {
  const { error } = await getClient().rpc('add_order_item', { p_order_id: orderId, p_product_id: productId, p_quantity: 1 })
  if (error) throw error
}

export async function setItemQuantity(itemId: string, quantity: number): Promise<void> {
  const { error } = await getClient().rpc('set_order_item_quantity', { p_item_id: itemId, p_quantity: quantity })
  if (error) throw error
}

export async function setReceiptMode(orderId: string, mode: ReceiptMode): Promise<void> {
  const { error } = await getClient().rpc('set_order_receipt_mode', { p_order_id: orderId, p_receipt_mode: mode })
  if (error) throw error
}

export async function applyDiscount(orderId: string, type: Exclude<DiscountType, 'none'>, value: number, reason: string): Promise<void> {
  const { error } = await getClient().rpc('apply_order_discount', {
    p_order_id: orderId,
    p_discount_type: type,
    p_discount_value: value,
    p_reason: reason,
  })
  if (error) throw error
}

export async function clearDiscount(orderId: string): Promise<void> {
  const { error } = await getClient().rpc('clear_order_discount', { p_order_id: orderId })
  if (error) throw error
}

export async function checkoutOrder(orderId: string, method: PaymentMethod, receivedAmount: number, transferReference: string, transferConfirmed: boolean, clientRequestId: string): Promise<ReceiptResult> {
  const { data, error } = await getClient().rpc('checkout_order', {
    p_order_id: orderId,
    p_method: method,
    p_received_amount: receivedAmount,
    p_transfer_reference: transferReference,
    p_transfer_confirmed: transferConfirmed,
    p_client_request_id: clientRequestId,
  })
  if (error) throw error
  const payload = data as unknown as CheckoutPayload
  return {
    receiptId: payload.receipt.id,
    orderNumber: payload.order.order_number,
    total: asNumber(payload.order.total),
    paymentMethod: payload.payment.method,
    receivedAmount: asNumber(payload.payment.received_amount),
    changeAmount: asNumber(payload.payment.change_amount),
  }
}

export async function loadOrderReceiptPreview(orderId: string, mode: ReceiptMode): Promise<ReceiptPreview> {
  const { data, error } = await getClient().rpc('get_order_receipt_preview', { p_order_id: orderId, p_receipt_mode: mode })
  if (error) throw error
  return toReceiptPreview(data as unknown as ReceiptPreviewPayload)
}

interface ReceiptRow { readonly id: string; readonly payload: ReceiptPreviewPayload }

export async function prepareAndRequestOrderReceipt(orderId: string, mode: ReceiptMode, clientRequestId: string): Promise<string> {
  const { data, error } = await getClient().rpc('prepare_and_request_order_receipt', {
    p_order_id: orderId,
    p_receipt_mode: mode,
    p_client_request_id: clientRequestId,
  })
  if (error) throw error
  return (data as unknown as ReceiptRow).id
}

export async function voidOrder(orderId: string, reason: string): Promise<void> {
  const { error } = await getClient().rpc('void_order', { p_order_id: orderId, p_reason: reason })
  if (error) throw error
}

export async function cancelEmptyOrder(orderId: string): Promise<void> {
  const { error } = await getClient().rpc('cancel_empty_order', { p_order_id: orderId })
  if (error) throw error
}

export async function cancelOrderReceiptPreview(receiptId: string): Promise<void> {
  const { error } = await getClient().rpc('cancel_order_receipt_preview', { p_receipt_id: receiptId })
  if (error) throw error
}

export async function requestReceiptReprint(receiptId: string): Promise<void> {
  const { error } = await getClient().rpc('request_receipt_reprint', { p_receipt_id: receiptId })
  if (error) throw error
}

export async function refundOrder(orderId: string, method: PaymentMethod, reason: string): Promise<void> {
  const { error } = await getClient().rpc('refund_order', { p_order_id: orderId, p_method: method, p_reason: reason })
  if (error) throw error
}

export async function startOrderCorrection(orderId: string, reason: string, clientRequestId: string): Promise<OrderCorrection> {
  const { data, error } = await getClient().rpc('start_order_correction', {
    p_order_id: orderId,
    p_reason: reason,
    p_client_request_id: clientRequestId,
  })
  if (error) throw error
  return toCorrection(data as unknown as CorrectionRow)
}

export async function loadOrderCorrection(correctionId: string): Promise<OrderCorrectionDetail> {
  const client = getClient()
  const [{ data: correctionData, error: correctionError }, { data: itemData, error: itemError }] = await Promise.all([
    client.from('order_corrections').select('id, source_order_id, root_order_id, replacement_order_id, revision_no, status, reason, table_id, receipt_mode, discount_type, discount_value, discount_reason, subtotal, discount, total, business_at').eq('id', correctionId).single(),
    client.from('order_correction_items').select('id, product_id, product_name_snapshot, unit_price, quantity, line_total').eq('correction_id', correctionId).order('created_at'),
  ])
  if (correctionError) throw correctionError
  if (itemError) throw itemError
  const correction = toCorrection(correctionData as unknown as CorrectionRow)
  const source = await loadOrder(correction.sourceOrderId)
  return {
    correction,
    source: source.order,
    sourceItems: source.items,
    items: (itemData as unknown as readonly CorrectionItemRow[]).map((row): OrderCorrectionItem => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name_snapshot,
      unitPrice: asNumber(row.unit_price),
      quantity: asNumber(row.quantity),
      lineTotal: asNumber(row.line_total),
    })),
  }
}

export async function loadActiveOrderCorrection(orderId: string): Promise<OrderCorrectionDetail | null> {
  const { data, error } = await getClient().from('order_corrections').select('id').eq('source_order_id', orderId).eq('status', 'draft').maybeSingle()
  if (error) throw error
  return data ? loadOrderCorrection((data as { readonly id: string }).id) : null
}

export async function addCorrectionItem(correctionId: string, productId: string): Promise<OrderCorrection> {
  const { data, error } = await getClient().rpc('add_order_correction_item', { p_correction_id: correctionId, p_product_id: productId, p_quantity: 1 })
  if (error) throw error
  return toCorrection(data as unknown as CorrectionRow)
}

export async function setCorrectionItemQuantity(itemId: string, quantity: number): Promise<OrderCorrection> {
  const { data, error } = await getClient().rpc('set_order_correction_item_quantity', { p_item_id: itemId, p_quantity: quantity })
  if (error) throw error
  return toCorrection(data as unknown as CorrectionRow)
}

export async function setCorrectionReceiptMode(correctionId: string, mode: ReceiptMode): Promise<OrderCorrection> {
  const { data, error } = await getClient().rpc('set_order_correction_receipt_mode', { p_correction_id: correctionId, p_receipt_mode: mode })
  if (error) throw error
  return toCorrection(data as unknown as CorrectionRow)
}

export async function applyCorrectionDiscount(correctionId: string, type: Exclude<DiscountType, 'none'>, value: number, reason: string): Promise<OrderCorrection> {
  const { data, error } = await getClient().rpc('apply_order_correction_discount', { p_correction_id: correctionId, p_discount_type: type, p_discount_value: value, p_reason: reason })
  if (error) throw error
  return toCorrection(data as unknown as CorrectionRow)
}

export async function clearCorrectionDiscount(correctionId: string): Promise<OrderCorrection> {
  const { data, error } = await getClient().rpc('clear_order_correction_discount', { p_correction_id: correctionId })
  if (error) throw error
  return toCorrection(data as unknown as CorrectionRow)
}

export async function cancelOrderCorrection(correctionId: string): Promise<void> {
  const { error } = await getClient().rpc('cancel_order_correction', { p_correction_id: correctionId })
  if (error) throw error
}

export async function finalizeOrderCorrection(
  correctionId: string,
  refundMethod: PaymentMethod,
  newPaymentMethod: PaymentMethod,
  receivedAmount: number,
  newTransferReference: string,
  refundTransferReference: string,
  newTransferConfirmed: boolean,
): Promise<ReceiptResult> {
  const { data, error } = await getClient().rpc('finalize_order_correction', {
    p_correction_id: correctionId,
    p_refund_method: refundMethod,
    p_new_payment_method: newPaymentMethod,
    p_new_received_amount: receivedAmount,
    p_new_transfer_reference: newTransferReference,
    p_refund_transfer_reference: refundTransferReference,
    p_new_transfer_confirmed: newTransferConfirmed,
  })
  if (error) throw error
  const payload = data as unknown as CorrectionResultPayload
  return {
    receiptId: payload.receipt.id,
    orderNumber: payload.source_order.order_number,
    displayOrderNumber: `${payload.source_order.order_number}-R${payload.correction.revision_no}`,
    total: asNumber(payload.replacement_order.total),
    paymentMethod: payload.payment.method,
    receivedAmount: asNumber(payload.payment.received_amount),
    changeAmount: asNumber(payload.payment.change_amount),
  }
}
