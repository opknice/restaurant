export type DiscountType = 'none' | 'percent' | 'fixed'
export type PaymentMethod = 'cash' | 'transfer'
export type ReceiptMode = 'shop' | 'field'

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
}
