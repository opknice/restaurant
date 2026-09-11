import { supabase } from '../../lib/supabase'
import type { DiscountType, Order, OrderItem, PaymentMethod, Product, ReceiptMode, ReceiptResult, SalesTable } from './salesTypes'

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
  readonly id: string
  readonly name: string
  readonly price: number | string
  readonly categories: { readonly name: string } | null
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
  const { data, error } = await getClient()
    .from('products')
    .select('id, name, price, category_id, categories(name)')
    .eq('active', true)
    .order('name')
  if (error) throw error
  return (data as unknown as readonly ProductRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    price: asNumber(row.price),
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? 'ไม่ระบุหมวดหมู่',
  }))
}

export async function loadOrder(orderId: string): Promise<{ order: Order; items: OrderItem[] }> {
  const client = getClient()
  const [{ data: orderData, error: orderError }, { data: itemsData, error: itemsError }] = await Promise.all([
    client.from('orders').select('id, order_number, table_id, status, receipt_mode, subtotal, discount_type, discount_value, discount, total').eq('id', orderId).single(),
    client.from('order_items').select('id, product_name_snapshot, unit_price, quantity, line_total').eq('order_id', orderId).order('created_at'),
  ])
  if (orderError) throw orderError
  if (itemsError) throw itemsError
  return {
    order: toOrder(orderData as unknown as OrderRow),
    items: (itemsData as unknown as readonly ItemRow[]).map((row) => ({
      id: row.id,
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

export async function checkoutOrder(orderId: string, method: PaymentMethod, receivedAmount: number, transferReference: string): Promise<ReceiptResult> {
  const { data, error } = await getClient().rpc('checkout_order', {
    p_order_id: orderId,
    p_method: method,
    p_received_amount: receivedAmount,
    p_transfer_reference: transferReference,
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

export async function voidOrder(orderId: string, reason: string): Promise<void> {
  const { error } = await getClient().rpc('void_order', { p_order_id: orderId, p_reason: reason })
  if (error) throw error
}

export async function requestReceiptPrint(receiptId: string): Promise<void> {
  const { error } = await getClient().rpc('request_receipt_print', { p_receipt_id: receiptId })
  if (error) throw error
}

export async function refundOrder(orderId: string, method: PaymentMethod, reason: string): Promise<void> {
  const { error } = await getClient().rpc('refund_order', { p_order_id: orderId, p_method: method, p_reason: reason })
  if (error) throw error
}
