import { supabase } from '../../lib/supabase'
import type { PaymentMethod, ReceiptMode } from '../sales/salesTypes'
import type { HistoryRow, SalesReport } from './reportTypes'
import { mapSalesReport } from './salesReportMapper'
import type { SalesReportRpc } from './salesReportMapper'

interface HistoryRpcRow { readonly order_id: string; readonly order_number: number; readonly display_order_number?: string; readonly revision_no?: number; readonly table_name: string; readonly status: HistoryRow['status']; readonly receipt_mode: ReceiptMode; readonly subtotal: number | string; readonly discount: number | string; readonly total: number | string; readonly closed_at: string | null; readonly payment_method: PaymentMethod | null; readonly refund_amount: number | string; readonly receipt_id: string | null }

function client() { if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase'); return supabase }
function number(value: number | string) { return typeof value === 'number' ? value : Number(value) }
function historyRow(row: HistoryRpcRow): HistoryRow { return { orderId: row.order_id, orderNumber: row.order_number, displayOrderNumber: row.display_order_number ?? String(row.order_number), revisionNo: row.revision_no ?? 0, tableName: row.table_name, status: row.status, receiptMode: row.receipt_mode, subtotal: number(row.subtotal), discount: number(row.discount), total: number(row.total), closedAt: row.closed_at, paymentMethod: row.payment_method, refundAmount: number(row.refund_amount), receiptId: row.receipt_id } }

export async function loadHistory(from: string, to: string, orderNumber: number | null): Promise<HistoryRow[]> {
  const { data, error } = await client().rpc('list_sales_history', { p_from: from, p_to: to, p_order_number: orderNumber ?? undefined })
  if (error) throw error
  return (data as unknown as readonly HistoryRpcRow[]).map(historyRow)
}

export async function loadHistoryPage(from: string, to: string, orderNumber: number | null, cursor: { readonly closedAt: string; readonly orderId: string } | null): Promise<{ rows: HistoryRow[]; hasMore: boolean }> {
  const { data, error } = await client().rpc('list_sales_history_page', { p_from: from, p_to: to, p_order_number: orderNumber ?? undefined, p_cursor_closed_at: cursor?.closedAt, p_cursor_order_id: cursor?.orderId, p_limit: 25 })
  if (error) throw error
  const mapped = (data as unknown as readonly HistoryRpcRow[]).map(historyRow)
  return { rows: mapped.slice(0, 25), hasMore: mapped.length > 25 }
}

export async function deleteSalesHistoryOrder(orderId: string): Promise<number> {
  const { data, error } = await client().rpc('delete_sales_history_order', { p_order_id: orderId })
  if (error) throw error
  return Number(data ?? 0)
}

export async function loadReport(from: string, to: string): Promise<SalesReport> {
  const { data, error } = await client().rpc('get_sales_report', { p_from: from, p_to: to })
  if (error) throw error
  return mapSalesReport(data as unknown as SalesReportRpc)
}
