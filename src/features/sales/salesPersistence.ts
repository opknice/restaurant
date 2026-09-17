import type { PaymentMethod, ReceiptResult, SalesView } from './salesTypes'
import { isAnimalKeyword, isRiceSizeKeyword, isServingContainerKeyword, normalizeAnimalKeywordFilters, normalizeRiceSizeFilters, normalizeServingContainerFilters, type AnimalKeyword, type RiceSizeKeyword, type ServingContainerKeyword } from './meatKeywordFilters'

export type SalesCheckoutStep = 'preview' | 'payment' | null

export interface SalesDraftSnapshot {
  readonly version: 1
  readonly updatedAt: number
  readonly selectedTableId: string | null
  readonly orderId: string | null
  readonly activeView?: SalesView
  readonly searchQuery?: string
  readonly isMobileCartOpen?: boolean
  // Kept as the original key so existing cashier drafts remain compatible.
  readonly meatKeywordFilters?: readonly AnimalKeyword[]
  readonly servingContainerFilters?: readonly ServingContainerKeyword[]
  readonly riceSizeFilters?: readonly RiceSizeKeyword[]
  readonly categoryFilter: string
  readonly paymentMethod: PaymentMethod
  readonly receivedAmount: string
  readonly checkoutStep: SalesCheckoutStep
  readonly preparedReceiptId: string | null
  readonly printRequestId: string | null
  readonly checkoutRequestId: string | null
  readonly showDiscount: boolean
  readonly discountType: 'percent' | 'fixed'
  readonly discountValue: string
  readonly discountReason: string
  readonly transferReference: string
  readonly transferConfirmed: boolean
  readonly receipt: ReceiptResult | null
}

const STORAGE_PREFIX = 'restaurant-pos.sales-workspace.v1'

export function createEmptySalesDraft(): SalesDraftSnapshot {
  return {
    version: 1,
    updatedAt: Date.now(),
    selectedTableId: null,
    orderId: null,
    activeView: 'tables',
    searchQuery: '',
    isMobileCartOpen: false,
    meatKeywordFilters: [],
    servingContainerFilters: [],
    riceSizeFilters: [],
    categoryFilter: 'ทั้งหมด',
    paymentMethod: 'cash',
    receivedAmount: '',
    checkoutStep: null,
    preparedReceiptId: null,
    printRequestId: null,
    checkoutRequestId: null,
    showDiscount: false,
    discountType: 'percent',
    discountValue: '',
    discountReason: '',
    transferReference: '',
    transferConfirmed: false,
    receipt: null,
  }
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}.${userId}`
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === 'cash' || value === 'transfer'
}

function isReceipt(value: unknown): value is ReceiptResult {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.receiptId === 'string'
    && typeof row.orderNumber === 'number'
    && typeof row.total === 'number'
    && isPaymentMethod(row.paymentMethod)
    && typeof row.receivedAmount === 'number'
    && typeof row.changeAmount === 'number'
    && (row.displayOrderNumber === undefined || typeof row.displayOrderNumber === 'string')
}

function isSnapshot(value: unknown): value is SalesDraftSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return row.version === 1
    && typeof row.updatedAt === 'number'
    && (row.selectedTableId === null || typeof row.selectedTableId === 'string')
    && (row.orderId === null || typeof row.orderId === 'string')
    && (row.activeView === undefined || row.activeView === 'tables' || row.activeView === 'menu')
    && (row.searchQuery === undefined || typeof row.searchQuery === 'string')
    && (row.isMobileCartOpen === undefined || typeof row.isMobileCartOpen === 'boolean')
    && (row.meatKeywordFilters === undefined || (Array.isArray(row.meatKeywordFilters) && row.meatKeywordFilters.every(isAnimalKeyword)))
    && (row.servingContainerFilters === undefined || (Array.isArray(row.servingContainerFilters) && row.servingContainerFilters.every(isServingContainerKeyword)))
    && (row.riceSizeFilters === undefined || (Array.isArray(row.riceSizeFilters) && row.riceSizeFilters.every(isRiceSizeKeyword)))
    && typeof row.categoryFilter === 'string'
    && isPaymentMethod(row.paymentMethod)
    && typeof row.receivedAmount === 'string'
    && (row.checkoutStep === null || row.checkoutStep === 'preview' || row.checkoutStep === 'payment')
    && (row.preparedReceiptId === null || typeof row.preparedReceiptId === 'string')
    && (row.printRequestId === null || typeof row.printRequestId === 'string')
    && (row.checkoutRequestId === null || typeof row.checkoutRequestId === 'string')
    && typeof row.showDiscount === 'boolean'
    && (row.discountType === 'percent' || row.discountType === 'fixed')
    && typeof row.discountValue === 'string'
    && typeof row.discountReason === 'string'
    && typeof row.transferReference === 'string'
    && typeof row.transferConfirmed === 'boolean'
    && (row.receipt === null || isReceipt(row.receipt))
}

export function readSalesDraft(userId: string | null): SalesDraftSnapshot | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!isSnapshot(value)) return null
    return {
      ...value,
      activeView: value.activeView ?? 'tables',
      searchQuery: value.searchQuery ?? '',
      isMobileCartOpen: value.isMobileCartOpen ?? false,
      meatKeywordFilters: normalizeAnimalKeywordFilters(value.meatKeywordFilters ?? []),
      servingContainerFilters: normalizeServingContainerFilters(value.servingContainerFilters ?? []),
      riceSizeFilters: normalizeRiceSizeFilters(value.riceSizeFilters ?? []),
    }
  } catch {
    return null
  }
}

export function updateSalesDraft(userId: string | null, patch: Partial<SalesDraftSnapshot>): void {
  if (!userId || typeof window === 'undefined') return
  try {
    const current = readSalesDraft(userId) ?? createEmptySalesDraft()
    const next: SalesDraftSnapshot = { ...current, ...patch, version: 1, updatedAt: Date.now() }
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next))
  } catch {
    // Private browsing or a full storage quota should not block sales operations.
  }
}

export function clearSalesDraft(userId: string | null): void {
  if (!userId || typeof window === 'undefined') return
  try { window.localStorage.removeItem(storageKey(userId)) } catch { /* Storage may be disabled. */ }
}
