import type { ProductReportRow, ReportSummary, SalesReport, SellerReportRow, TableReportRow } from './reportTypes'

export interface SummaryRpc { readonly paid_order_count: number | string; readonly void_order_count: number | string; readonly refunded_order_count: number | string; readonly corrected_order_count?: number | string; readonly sales_total: number | string; readonly discount_total: number | string; readonly refund_total: number | string; readonly net_total: number | string; readonly cash_total: number | string; readonly transfer_total: number | string }
export interface ProductRpc { readonly product_name: string; readonly category_name: string; readonly quantity: number | string; readonly total: number | string }
export interface SellerRpc { readonly seller_name: string; readonly bill_count: number | string; readonly total: number | string }
export interface TableRpc { readonly table_name: string; readonly bill_count: number | string; readonly total: number | string }
export interface SalesReportRpc { readonly summary: SummaryRpc; readonly products: readonly ProductRpc[]; readonly sellers: readonly SellerRpc[]; readonly tables: readonly TableRpc[] }

export function reportNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function mapSalesReport(payload: SalesReportRpc): SalesReport {
  const summary: ReportSummary = {
    paidOrderCount: reportNumber(payload.summary.paid_order_count),
    voidOrderCount: reportNumber(payload.summary.void_order_count),
    refundedOrderCount: reportNumber(payload.summary.refunded_order_count),
    salesTotal: reportNumber(payload.summary.sales_total),
    discountTotal: reportNumber(payload.summary.discount_total),
    refundTotal: reportNumber(payload.summary.refund_total),
    netTotal: reportNumber(payload.summary.net_total),
    cashTotal: reportNumber(payload.summary.cash_total),
    transferTotal: reportNumber(payload.summary.transfer_total),
    correctedOrderCount: reportNumber(payload.summary.corrected_order_count),
  }
  const products: ProductReportRow[] = payload.products.map((row) => ({ productName: row.product_name, categoryName: row.category_name, quantity: reportNumber(row.quantity), total: reportNumber(row.total) }))
  const sellers: SellerReportRow[] = payload.sellers.map((row) => ({ sellerName: row.seller_name, billCount: reportNumber(row.bill_count), total: reportNumber(row.total) }))
  const tables: TableReportRow[] = payload.tables.map((row) => ({ tableName: row.table_name, billCount: reportNumber(row.bill_count), total: reportNumber(row.total) }))
  return { summary, products, sellers, tables }
}
