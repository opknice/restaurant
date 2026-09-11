import { supabase } from '../../lib/supabase'
import type { PaymentMethod, ReceiptMode } from '../sales/salesTypes'
import type { HistoryRow, ProductReportRow, ReportSummary, SalesReport, SellerReportRow, TableReportRow } from './reportTypes'

interface HistoryRpcRow { readonly order_id: string; readonly order_number: number; readonly table_name: string; readonly status: HistoryRow['status']; readonly receipt_mode: ReceiptMode; readonly subtotal: number | string; readonly discount: number | string; readonly total: number | string; readonly closed_at: string | null; readonly payment_method: PaymentMethod | null; readonly refund_amount: number | string; readonly receipt_id: string | null }
interface SummaryRpc { readonly paid_order_count: number; readonly void_order_count: number; readonly refunded_order_count: number; readonly sales_total: number | string; readonly discount_total: number | string; readonly refund_total: number | string; readonly net_total: number | string; readonly cash_total: number | string; readonly transfer_total: number | string }
interface ProductRpc { readonly product_name: string; readonly category_name: string; readonly quantity: number | string; readonly total: number | string }
interface SellerRpc { readonly seller_name: string; readonly bill_count: number; readonly total: number | string }
interface TableRpc { readonly table_name: string; readonly bill_count: number; readonly total: number | string }

function client() { if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase'); return supabase }
function number(value: number | string) { return typeof value === 'number' ? value : Number(value) }
function historyRow(row: HistoryRpcRow): HistoryRow { return { orderId: row.order_id, orderNumber: row.order_number, tableName: row.table_name, status: row.status, receiptMode: row.receipt_mode, subtotal: number(row.subtotal), discount: number(row.discount), total: number(row.total), closedAt: row.closed_at, paymentMethod: row.payment_method, refundAmount: number(row.refund_amount), receiptId: row.receipt_id } }

export async function loadHistory(from: string, to: string, orderNumber: number | null): Promise<HistoryRow[]> {
  const { data, error } = await client().rpc('list_sales_history', { p_from: from, p_to: to, p_order_number: orderNumber })
  if (error) throw error
  return (data as unknown as readonly HistoryRpcRow[]).map(historyRow)
}

export async function loadReport(from: string, to: string): Promise<SalesReport> {
  const { data, error } = await client().rpc('get_sales_report', { p_from: from, p_to: to })
  if (error) throw error
  const payload = data as unknown as { readonly summary: SummaryRpc; readonly products: readonly ProductRpc[]; readonly sellers: readonly SellerRpc[]; readonly tables: readonly TableRpc[] }
  const summary: ReportSummary = { paidOrderCount: payload.summary.paid_order_count, voidOrderCount: payload.summary.void_order_count, refundedOrderCount: payload.summary.refunded_order_count, salesTotal: number(payload.summary.sales_total), discountTotal: number(payload.summary.discount_total), refundTotal: number(payload.summary.refund_total), netTotal: number(payload.summary.net_total), cashTotal: number(payload.summary.cash_total), transferTotal: number(payload.summary.transfer_total) }
  const products: ProductReportRow[] = payload.products.map((row) => ({ productName: row.product_name, categoryName: row.category_name, quantity: number(row.quantity), total: number(row.total) }))
  const sellers: SellerReportRow[] = payload.sellers.map((row) => ({ sellerName: row.seller_name, billCount: row.bill_count, total: number(row.total) }))
  const tables: TableReportRow[] = payload.tables.map((row) => ({ tableName: row.table_name, billCount: row.bill_count, total: number(row.total) }))
  return { summary, products, sellers, tables }
}
