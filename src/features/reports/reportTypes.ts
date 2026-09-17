import type { PaymentMethod, ReceiptMode } from '../sales/salesTypes'

export interface HistoryRow {
  readonly orderId: string
  readonly orderNumber: number
  readonly displayOrderNumber: string
  readonly revisionNo: number
  readonly tableName: string
  readonly status: 'open' | 'paid' | 'void' | 'refunded'
  readonly receiptMode: ReceiptMode
  readonly subtotal: number
  readonly discount: number
  readonly total: number
  readonly closedAt: string | null
  readonly paymentMethod: PaymentMethod | null
  readonly refundAmount: number
  readonly receiptId: string | null
}

export interface ReportSummary {
  readonly paidOrderCount: number
  readonly voidOrderCount: number
  readonly refundedOrderCount: number
  readonly salesTotal: number
  readonly discountTotal: number
  readonly refundTotal: number
  readonly netTotal: number
  readonly cashTotal: number
  readonly transferTotal: number
  readonly correctedOrderCount: number
}

export interface ProductReportRow { readonly productName: string; readonly categoryName: string; readonly quantity: number; readonly total: number }
export interface SellerReportRow { readonly sellerName: string; readonly billCount: number; readonly total: number }
export interface TableReportRow { readonly tableName: string; readonly billCount: number; readonly total: number }

export interface SalesReport {
  readonly summary: ReportSummary
  readonly products: ProductReportRow[]
  readonly sellers: SellerReportRow[]
  readonly tables: TableReportRow[]
}
