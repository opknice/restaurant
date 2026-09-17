export type DiscountType = 'none' | 'percent' | 'fixed'
export type PaymentMethod = 'cash' | 'transfer'
export type ReceiptMode = 'shop' | 'field'
export type CorrectionStatus = 'draft' | 'finalized' | 'cancelled'
export type SalesView = 'tables' | 'menu'

export interface SalesTable {
  readonly id: string
  readonly tableNumber: string
  readonly displayName: string
  readonly hasOpenOrder: boolean
  readonly openOrderId: string | null
  readonly isOwnedByCurrentUser: boolean
}

export interface Product {
  readonly id: string
  readonly name: string
  readonly price: number
  readonly categoryId: string
  readonly categoryName: string
  readonly groupName: string | null
  readonly isFavorite: boolean
  readonly subcategories: readonly ProductSubcategory[]
}

export interface ProductGroup {
  readonly id: string
  readonly name: string
  readonly products: readonly Product[]
}

export interface ProductSubcategory {
  readonly id: string
  readonly name: string
}

export interface Order {
  readonly id: string
  readonly orderNumber: number
  readonly tableId: string
  readonly status: 'open' | 'paid' | 'void' | 'refunded'
  readonly receiptMode: ReceiptMode
  readonly subtotal: number
  readonly discountType: DiscountType
  readonly discountValue: number
  readonly discount: number
  readonly total: number
}

export interface OrderItem {
  readonly id: string
  readonly productId: string | null
  readonly productName: string
  readonly unitPrice: number
  readonly quantity: number
  readonly lineTotal: number
}

export interface ReceiptResult {
  readonly receiptId: string
  readonly orderNumber: number
  readonly total: number
  readonly paymentMethod: PaymentMethod
  readonly receivedAmount: number
  readonly changeAmount: number
  readonly displayOrderNumber?: string
}

export interface ReceiptPreview {
  readonly mode: ReceiptMode
  readonly orderNumber: number
  readonly openedAt: string
  readonly store: {
    readonly storeName: string
    readonly phone: string | null
    readonly receiptFooter: string | null
    readonly paymentQrPath: string | null
    readonly bankPaymentLabel: string | null
    readonly bankAccountName: string | null
    readonly bankAccountNumber: string | null
    readonly bankReference: string | null
  }
  readonly tableName: string
  readonly items: OrderItem[]
  readonly subtotal: number
  readonly discount: number
  readonly total: number
}

export interface OrderCorrection {
  readonly id: string
  readonly sourceOrderId: string
  readonly rootOrderId: string
  readonly replacementOrderId: string | null
  readonly revisionNo: number
  readonly status: CorrectionStatus
  readonly reason: string
  readonly tableId: string | null
  readonly receiptMode: ReceiptMode
  readonly discountType: DiscountType
  readonly discountValue: number
  readonly discountReason: string | null
  readonly subtotal: number
  readonly discount: number
  readonly total: number
  readonly businessAt: string
}

export interface OrderCorrectionItem {
  readonly id: string
  readonly productId: string | null
  readonly productName: string
  readonly unitPrice: number
  readonly quantity: number
  readonly lineTotal: number
}

export interface OrderCorrectionDetail {
  readonly correction: OrderCorrection
  readonly source: Order
  readonly sourceItems: OrderItem[]
  readonly items: OrderCorrectionItem[]
}
