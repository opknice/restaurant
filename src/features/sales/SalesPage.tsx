import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, MouseEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { useConnectivity } from '../../hooks/useConnectivity'
import {
  addItem,
  applyDiscount,
  cancelEmptyOrder,
  cancelOrderReceiptPreview,
  checkoutOrder,
  clearDiscount,
  createOrder,
  loadOrderReceiptPreview,
  prepareAndRequestOrderReceipt,
  setItemQuantity,
  voidOrder,
} from './salesApi'
import type { PaymentMethod, ProductGroup, ReceiptMode, ReceiptPreview, ReceiptResult, SalesTable, SalesView } from './salesTypes'
import { createEmptySalesDraft, readSalesDraft, updateSalesDraft } from './salesPersistence'
import { getFavoriteProducts } from './favoriteProducts'
import { matchesProductFilters } from './salesFilters'
import { getAnimalKeywordOptions, getRiceSizeOptions, getServingContainerOptions, isRiceSizeFilterAvailable, isServingContainerFilterAvailable, normalizeAnimalKeywordFilters, normalizeRiceSizeFilters, normalizeServingContainerFilters, type AnimalKeyword, type RiceSizeKeyword, type ServingContainerKeyword } from './meatKeywordFilters'
import { groupProductsByManagerGroup } from './productGrouping'
import { useSalesWorkspace } from './useSalesWorkspace'

const currencyFormatter = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })

function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}

export function SalesPage() {
  const { profile, session } = useAuth()
  const userId = session?.user.id ?? null
  const isOnline = useConnectivity()
  const workspace = useSalesWorkspace(userId)
  const initialDraft = useMemo(() => readSalesDraft(userId) ?? createEmptySalesDraft(), [userId])
  const searchInputId = useId()
  const receivedAmountInputId = useId()
  const discountValueInputId = useId()
  const discountReasonInputId = useId()

  // Primary UI View: 'tables' (ผังโต๊ะ) or 'menu' (หน้าสั่งอาหาร)
  const [activeView, setActiveView] = useState<SalesView>(() => initialDraft.activeView ?? 'tables')

  // Filters & Search
  const [categoryFilter, setCategoryFilter] = useState(() => initialDraft.categoryFilter)
  const [animalKeywordFilters, setAnimalKeywordFilters] = useState<AnimalKeyword[]>(() => normalizeAnimalKeywordFilters(initialDraft.meatKeywordFilters ?? []))
  const [servingContainerFilters, setServingContainerFilters] = useState<ServingContainerKeyword[]>(() => normalizeServingContainerFilters(initialDraft.servingContainerFilters ?? []))
  const [riceSizeFilters, setRiceSizeFilters] = useState<RiceSizeKeyword[]>(() => normalizeRiceSizeFilters(initialDraft.riceSizeFilters ?? []))
  const [searchQuery, setSearchQuery] = useState(() => initialDraft.searchQuery ?? '')

  // UI State: Mobile Sheet & Dialogs
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(() => initialDraft.isMobileCartOpen ?? false)
  const [showVoidDialog, setShowVoidDialog] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  // Checkout & Payment
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialDraft.paymentMethod)
  const [receivedAmount, setReceivedAmount] = useState(() => initialDraft.receivedAmount)
  const [checkoutStep, setCheckoutStep] = useState<'preview' | 'payment' | null>(() => initialDraft.checkoutStep)
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreview | null>(null)
  const [preparedReceiptId, setPreparedReceiptId] = useState<string | null>(() => initialDraft.preparedReceiptId)
  const printRequestId = useRef<string | null>(initialDraft.printRequestId)
  const checkoutRequestId = useRef<string | null>(initialDraft.checkoutRequestId)

  // Discounts
  const [showDiscount, setShowDiscount] = useState(() => initialDraft.showDiscount)
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>(() => initialDraft.discountType)
  const [discountValue, setDiscountValue] = useState(() => initialDraft.discountValue)
  const [discountReason, setDiscountReason] = useState(() => initialDraft.discountReason)

  // Transfer
  const [transferReference, setTransferReference] = useState(() => initialDraft.transferReference)
  const [transferConfirmed, setTransferConfirmed] = useState(() => initialDraft.checkoutStep === 'payment' && initialDraft.paymentMethod === 'transfer' ? false : initialDraft.transferConfirmed)
  const [receipt, setReceipt] = useState<ReceiptResult | null>(() => initialDraft.receipt)
  const isDraftHydrated = Boolean(userId)

  const currentOrder = workspace.order
  const setWorkspaceError = workspace.setErrorMessage

  // Normalize persisted filters during render so a removed category or tag
  // cannot leave the menu in an invalid state or trigger cascading renders.
  const categories = useMemo(() => ['ทั้งหมด', ...new Set(workspace.products.map((p) => p.categoryName))], [workspace.products])
  const normalizedCategoryFilter = categoryFilter === 'ทั้งหมด' || categories.includes(categoryFilter) ? categoryFilter : 'ทั้งหมด'
  const categoryProductCounts = useMemo(() => {
    const counts = new Map<string, number>([['ทั้งหมด', workspace.products.length]])
    for (const product of workspace.products) counts.set(product.categoryName, (counts.get(product.categoryName) ?? 0) + 1)
    return counts
  }, [workspace.products])
  const normalizedAnimalKeywordFilters = useMemo(() => normalizeAnimalKeywordFilters(animalKeywordFilters), [animalKeywordFilters])
  const normalizedServingContainerFilters = useMemo(
    () => isServingContainerFilterAvailable(normalizedCategoryFilter) ? normalizeServingContainerFilters(servingContainerFilters) : [],
    [normalizedCategoryFilter, servingContainerFilters],
  )
  const normalizedRiceSizeFilters = useMemo(
    () => isRiceSizeFilterAvailable(normalizedCategoryFilter) ? normalizeRiceSizeFilters(riceSizeFilters) : [],
    [normalizedCategoryFilter, riceSizeFilters],
  )
  const animalKeywordOptions = useMemo(() => getAnimalKeywordOptions(workspace.products, normalizedCategoryFilter), [normalizedCategoryFilter, workspace.products])
  const facetedOptionProducts = useMemo(
    () => workspace.products.filter((product) => matchesProductFilters(product, normalizedCategoryFilter, normalizedAnimalKeywordFilters, [], [], searchQuery)),
    [normalizedAnimalKeywordFilters, normalizedCategoryFilter, searchQuery, workspace.products],
  )
  const servingContainerOptions = useMemo(() => getServingContainerOptions(facetedOptionProducts, normalizedCategoryFilter), [facetedOptionProducts, normalizedCategoryFilter])
  const riceSizeOptions = useMemo(() => getRiceSizeOptions(facetedOptionProducts, normalizedCategoryFilter), [facetedOptionProducts, normalizedCategoryFilter])

  // Sync Draft
  useEffect(() => {
    if (!isDraftHydrated || !userId) return
    updateSalesDraft(userId, {
      categoryFilter: normalizedCategoryFilter,
      activeView,
      searchQuery,
      isMobileCartOpen,
      meatKeywordFilters: normalizedAnimalKeywordFilters,
      servingContainerFilters: normalizedServingContainerFilters,
      riceSizeFilters: normalizedRiceSizeFilters,
      paymentMethod,
      receivedAmount,
      checkoutStep,
      preparedReceiptId,
      printRequestId: printRequestId.current,
      checkoutRequestId: checkoutRequestId.current,
      showDiscount,
      discountType,
      discountValue,
      discountReason,
      transferReference,
      transferConfirmed,
      receipt,
    })
  }, [activeView, checkoutStep, discountReason, discountType, discountValue, isDraftHydrated, isMobileCartOpen, normalizedAnimalKeywordFilters, normalizedCategoryFilter, normalizedRiceSizeFilters, normalizedServingContainerFilters, paymentMethod, preparedReceiptId, receipt, receivedAmount, searchQuery, showDiscount, transferConfirmed, transferReference, userId])

  // Receipt Preview Load
  useEffect(() => {
    if (!isDraftHydrated || !currentOrder || !checkoutStep || receiptPreview) return undefined
    let cancelled = false
    void loadOrderReceiptPreview(currentOrder.id, currentOrder.receiptMode)
      .then((preview) => {
        if (!cancelled) setReceiptPreview(preview)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCheckoutStep(null)
          setWorkspaceError(readableError(error))
        }
      })
    return () => { cancelled = true }
  }, [checkoutStep, currentOrder, isDraftHydrated, receiptPreview, setWorkspaceError])

  // Reset checkout on order close. Keeping the state transition in a
  // callback also makes the effect below responsible only for synchronization.
  const resetOrderUi = useCallback(() => {
    setActiveView('tables')
    setIsMobileCartOpen(false)
    // Start the next bill with a clean catalog so a previous search cannot hide menu items.
    setSearchQuery('')
    setCategoryFilter('ทั้งหมด')
    setAnimalKeywordFilters([])
    setServingContainerFilters([])
    setRiceSizeFilters([])
    if (checkoutStep) {
      setCheckoutStep(null)
      setReceiptPreview(null)
      setPreparedReceiptId(null)
      printRequestId.current = null
      checkoutRequestId.current = null
      setReceivedAmount('')
      setTransferReference('')
      setTransferConfirmed(false)
    }
    if (showDiscount) {
      setShowDiscount(false)
      setDiscountValue('')
      setDiscountReason('')
    }
  }, [checkoutStep, showDiscount])

  useEffect(() => {
    if (!isDraftHydrated || workspace.isLoading || currentOrder) return
    // The callback reconciles local UI with a close received from another device.
    // oxlint-disable-next-line react/set-state-in-effect
    resetOrderUi()
  }, [currentOrder, isDraftHydrated, resetOrderUi, workspace.isLoading])

  const cartQuantityByProductId = useMemo(() => new Map(workspace.items.map((item) => [item.productId, item.quantity])), [workspace.items])

  const visibleProducts = useMemo(
    () => workspace.products.filter((product) => matchesProductFilters(product, normalizedCategoryFilter, normalizedAnimalKeywordFilters, normalizedServingContainerFilters, normalizedRiceSizeFilters, searchQuery)),
    [normalizedAnimalKeywordFilters, normalizedCategoryFilter, normalizedRiceSizeFilters, normalizedServingContainerFilters, searchQuery, workspace.products],
  )
  const favoriteProducts = useMemo(() => getFavoriteProducts(visibleProducts), [visibleProducts])
  const productGroups = useMemo(() => groupProductsByManagerGroup(visibleProducts), [visibleProducts])

  const totalItemsCount = useMemo(() => {
    return workspace.items.reduce((sum, item) => sum + item.quantity, 0)
  }, [workspace.items])

  const cashReceived = Number(receivedAmount)
  const estimatedChange = workspace.order && paymentMethod === 'cash' && Number.isFinite(cashReceived)
    ? Math.max(0, Math.round((cashReceived - workspace.order.total) * 100) / 100)
    : 0

  const isCashValid = paymentMethod === 'cash' && Number.isFinite(cashReceived) && cashReceived >= (workspace.order?.total ?? 0)
  const isTransferValid = paymentMethod === 'transfer' && transferConfirmed
  const isPaymentValid = isCashValid || isTransferValid

  // Smart Cash Buttons based on bill total (Always >= total)
  const smartCashOptions = useMemo(() => {
    if (!workspace.order) return [100, 500, 1000]
    const total = workspace.order.total
    const options = new Set<number>()
    options.add(total) // Exact amount

    // Next nearest note boundaries
    const nextHundred = Math.ceil(total / 100) * 100
    if (nextHundred > total) options.add(nextHundred)

    const nextFiveHundred = Math.ceil(total / 500) * 500
    if (nextFiveHundred > total) options.add(nextFiveHundred)

    const nextThousand = Math.ceil(total / 1000) * 1000
    if (nextThousand > total) options.add(nextThousand)

    // Standard high denominations if strictly greater than total
    if (500 > total) options.add(500)
    if (1000 > total) options.add(1000)

    // Ensure all options are strictly >= total and sorted
    return Array.from(options)
      .filter((opt) => opt >= total)
      .sort((a, b) => a - b)
  }, [workspace.order])

  const resetCheckoutDraft = useCallback(() => {
    setCheckoutStep(null)
    setReceiptPreview(null)
    setPreparedReceiptId(null)
    printRequestId.current = null
    checkoutRequestId.current = null
    setReceivedAmount('')
    setTransferReference('')
    setTransferConfirmed(false)
  }, [])

  const perform = useCallback(async (operation: () => Promise<void>) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    workspace.setErrorMessage(null)
    if (!isOnline) {
      workspace.setErrorMessage('ไม่มีการเชื่อมต่ออินเทอร์เน็ต ไม่สามารถทำรายการได้')
      submittingRef.current = false
      setIsSubmitting(false)
      return
    }
    try {
      await operation()
    } catch (error: unknown) {
      workspace.setErrorMessage(readableError(error))
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }, [isOnline, workspace])

  // Table selection & Open Order actions
  const handleSelectTable = (table: SalesTable) => {
    if (table.hasOpenOrder && !table.isOwnedByCurrentUser) {
      workspace.setErrorMessage('โต๊ะนี้กำลังใช้งานโดยผู้ใช้อื่น ไม่สามารถเข้าบิลได้')
      return
    }
    void perform(async () => {
      await workspace.chooseTable(table)
      if (table.hasOpenOrder) {
        setActiveView('menu')
      }
    })
  }

  const handleOpenOrder = (tableToOpen?: SalesTable) => {
    const targetTable = tableToOpen ?? workspace.selectedTable
    if (!targetTable) return
    void perform(async () => {
      await workspace.chooseTable(targetTable)
      const nextOrder = await createOrder(targetTable.id)
      await workspace.refreshOrder(nextOrder.id)
      await workspace.refreshAll()
      setActiveView('menu')
    })
  }

  const handleDirectOpenOrder = (e: MouseEvent, table: SalesTable) => {
    e.stopPropagation()
    handleOpenOrder(table)
  }

  const handleAddProduct = (productId: string) => {
    if (!workspace.order) {
      setActiveView('tables')
      return
    }
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

  const openCheckoutPreview = () => {
    if (!workspace.order) return
    void perform(async () => {
      const preview = await loadOrderReceiptPreview(workspace.order!.id, workspace.order!.receiptMode)
      setPreparedReceiptId(null)
      printRequestId.current = null
      setReceiptPreview(preview)
      setCheckoutStep('preview')
      setIsMobileCartOpen(false)
    })
  }

  const printPreviewAndContinue = (mode: ReceiptMode) => {
    if (!workspace.order) return
    void perform(async () => {
      const requestId = printRequestId.current ?? crypto.randomUUID()
      printRequestId.current = requestId
      updateSalesDraft(userId, { printRequestId: requestId })
      const preview = await loadOrderReceiptPreview(workspace.order!.id, mode)
      setReceiptPreview(preview)
      const receiptId = await prepareAndRequestOrderReceipt(workspace.order!.id, mode, requestId)
      setPreparedReceiptId(receiptId)
      await workspace.refreshOrder(workspace.order!.id)
      setCheckoutStep('payment')
    })
  }

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!workspace.order || !isPaymentValid) return
    const amount = paymentMethod === 'transfer' ? workspace.order.total : cashReceived
    void perform(async () => {
      const requestId = checkoutRequestId.current ?? crypto.randomUUID()
      checkoutRequestId.current = requestId
      updateSalesDraft(userId, { checkoutRequestId: requestId })
      const result = await checkoutOrder(workspace.order!.id, paymentMethod, amount, transferReference, transferConfirmed, requestId)
      setReceipt(result)
      resetCheckoutDraft()
      workspace.setOrder(null)
      workspace.setItems([])
      await workspace.refreshAll()
      setActiveView('tables')
    })
  }

  const confirmVoid = () => {
    if (!workspace.order || !voidReason.trim()) return
    void perform(async () => {
      await voidOrder(workspace.order!.id, voidReason.trim())
      setShowVoidDialog(false)
      setVoidReason('')
      workspace.setOrder(null)
      workspace.setItems([])
      await workspace.refreshAll()
      setActiveView('tables')
    })
  }

  const handleCancelEmptyOrder = () => {
    if (!workspace.order || workspace.items.length > 0) return
    void perform(async () => {
      await cancelEmptyOrder(workspace.order!.id)
      workspace.setOrder(null)
      workspace.setItems([])
      await workspace.refreshAll()
      setActiveView('tables')
    })
  }

  const handleCancelCheckout = () => {
    if (!preparedReceiptId) {
      resetCheckoutDraft()
      return
    }

    void perform(async () => {
      await cancelOrderReceiptPreview(preparedReceiptId)
      resetCheckoutDraft()
    })
  }

  const handleTableCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, table: SalesTable) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleSelectTable(table)
  }

  return (
    <div className="pos-workspace" aria-label="ขายหน้าร้าน">
      {/* Top Bar: Navigation & Status */}
      <header className="pos-topbar">
        <div className="pos-table-status">
          {activeView === 'menu' ? (
            <button
              aria-label={`TABLE (${workspace.selectedTable?.tableNumber ?? '-'}) / Change`}
              className="table-switch-trigger"
              onClick={() => setActiveView('tables')}
              type="button"
            >
              <strong>โต๊ะที่ {workspace.selectedTable?.tableNumber ?? '-'} / เปลี่ยนโต๊ะ</strong>
            </button>
          ) : (
            <div className="pos-view-title">

            </div>
          )}
        </div>

        <div className="pos-topbar-actions">
          <button
            className="secondary-touch-button"
            disabled={workspace.isLoading || isSubmitting}
            onClick={() => void workspace.refreshAll()}
            type="button"
          >
            ↻ รีเฟรช
          </button>
        </div>
      </header>

      {/* Global Error Notice */}
      {workspace.errorMessage ? (
        <div className="pos-alert-banner error" role="alert">
          <span>⚠️ {workspace.errorMessage}</span>
          <button aria-label="ปิดข้อความแจ้งเตือน" onClick={() => workspace.setErrorMessage(null)} type="button">✕</button>
        </div>
      ) : null}

      {/* Success Notification */}
      {receipt ? (
        <div className="pos-alert-banner success" role="status">
          <div>
            <strong>✓ ชำระบิล #{receipt.displayOrderNumber ?? receipt.orderNumber} สำเร็จ</strong>
            <p>
              {receipt.paymentMethod === 'cash'
                ? `รับเงินมา ${formatCurrency(receipt.receivedAmount)} • เงินทอน ${formatCurrency(receipt.changeAmount)}`
                : 'ชำระผ่านเงินโอนเรียบร้อย'}
            </p>
          </div>
          <button className="primary-touch-button compact" onClick={() => setReceipt(null)} type="button">
            ปิด
          </button>
        </div>
      ) : null}

      {/* VIEW MODE 1: TABLE SELECTION VIEW */}
      {activeView === 'tables' ? (
        <section className="pos-tables-section" aria-label="ผังโต๊ะสำหรับเปิดบิล">
          <div className="pos-tables-grid">
            {workspace.tables.map((table) => {
              const isSelected = workspace.selectedTable?.id === table.id
              const isOccupied = table.hasOpenOrder
              return (
                <div
                  key={table.id}
                  className={`pos-table-card ${isSelected ? 'selected' : ''} ${isOccupied ? 'occupied' : 'empty'}`}
                  onClick={() => handleSelectTable(table)}
                  onKeyDown={(event) => handleTableCardKeyDown(event, table)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="table-card-top">
                    <strong className="table-card-name">{table.displayName}</strong>
                    <span className={`table-status-pill ${isOccupied ? 'occupied' : 'empty'}`}>
                      {isOccupied ? (table.isOwnedByCurrentUser ? 'บิลของคุณ' : 'กำลังใช้งาน') : 'ว่าง'}
                    </span>
                  </div>

                  <div className="table-card-bottom">
                    {isOccupied ? (
                      <span className="table-hint">
                        {table.isOwnedByCurrentUser ? 'แตะเพื่อเข้าบิล ➜' : 'กำลังใช้งานโดยผู้ใช้อื่น'}
                      </span>
                    ) : (
                      <button
                        className="table-open-direct-btn"
                        disabled={isSubmitting}
                        onClick={(e) => handleDirectOpenOrder(e, table)}
                        type="button"
                      >
                        + เปิดบิล
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sticky Action Footer when an empty table is selected */}
          {workspace.selectedTable && !workspace.selectedTable.hasOpenOrder && !workspace.order ? (
            <div className="pos-table-bottom-bar">
              <div className="selected-table-info">
                <span>เลือกโต๊ะ:</span>
                <strong>{workspace.selectedTable.displayName} (ว่าง)</strong>
              </div>
              <button
                className="primary-touch-button big"
                disabled={isSubmitting}
                onClick={() => handleOpenOrder(workspace.selectedTable!)}
                type="button"
              >
                + เปิดบิล {workspace.selectedTable.displayName}
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        /* VIEW MODE 2: ORDER & CATALOG VIEW */
        <div className="pos-main-container">
          {/* Left/Main Column: Catalog & Search */}
          <section className="pos-catalog-section" aria-label="รายการอาหารและเครื่องดื่ม">
            {/* Search & Barcode Input */}
            <div className="pos-search-bar">
              <label className="sr-only" htmlFor={searchInputId}>
                ค้นหาอาหารหรือเครื่องดื่ม
              </label>
              <span aria-hidden="true" className="search-icon">🔍</span>
              <input
                id={searchInputId}
                className="search-touch-input"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาชื่ออาหารหรือเครื่องดื่ม..."
                type="search"
                value={searchQuery}
              />
              {searchQuery ? (
                <button aria-label="ล้างคำค้นหา" className="search-clear-button" onClick={() => setSearchQuery('')} type="button">
                  ล้าง
                </button>
              ) : null}
            </div>

            <section aria-label="ตัวกรองรายการอาหาร" className="pos-filter-panel">
              <div className="pos-filter-heading">
                <div><span className="pos-filter-kicker">กรองเมนู</span><strong>เลือกหมวดอาหาร</strong></div>
                <span className="pos-filter-result">{visibleProducts.length} รายการ</span>
              </div>
              <div aria-label="หมวดหมู่สินค้า" className="pos-category-scroll" role="tablist">
                {categories.map((cat) => (
                  <button key={cat} aria-selected={normalizedCategoryFilter === cat} className={`category-pill ${normalizedCategoryFilter === cat ? 'active' : ''}`} onClick={() => { setCategoryFilter(cat); setAnimalKeywordFilters([]); setServingContainerFilters([]); setRiceSizeFilters([]) }} role="tab" type="button">
                    <span>{cat}</span><small> ({categoryProductCounts.get(cat) ?? 0})</small>
                  </button>
                ))}
              </div>
              <div className="pos-subcategory-filter">
                <div className="pos-subcategory-heading">
                  <span><strong>กรองตามเนื้อสัตว์</strong><small>เลือกได้ 1 รายการ</small></span>
                  {normalizedAnimalKeywordFilters.length > 0 ? <button className="filter-clear-button" onClick={() => setAnimalKeywordFilters([])} type="button">ล้างตัวกรอง</button> : null}
                </div>
                {animalKeywordOptions.length > 0 ? (
                  <>
                    <div aria-label="กรองตามเนื้อสัตว์" className="pos-subcategory-scroll" role="group">
                      <button aria-pressed={normalizedAnimalKeywordFilters.length === 0} className={`subcategory-pill ${normalizedAnimalKeywordFilters.length === 0 ? 'active' : ''}`} onClick={() => setAnimalKeywordFilters([])} type="button">ทั้งหมด <small>{categoryProductCounts.get(normalizedCategoryFilter) ?? workspace.products.length}</small></button>
                      {animalKeywordOptions.map((option) => {
                        const isSelected = normalizedAnimalKeywordFilters.includes(option.keyword)
                        return <button key={option.keyword} aria-pressed={isSelected} className={`subcategory-pill ${isSelected ? 'active' : ''}`} onClick={() => setAnimalKeywordFilters(isSelected ? [] : [option.keyword])} type="button">{option.keyword} <small>{option.productCount}</small></button>
                      })}
                    </div>
                    {normalizedAnimalKeywordFilters.length > 0 ? (
                      <div aria-label="ตัวกรองเนื้อสัตว์ที่เลือก" className="pos-selected-filters">
                        <span>เลือกแล้ว:</span>
                        {normalizedAnimalKeywordFilters.map((keyword) => <button className="selected-filter-chip" key={keyword} onClick={() => setAnimalKeywordFilters((current) => current.filter((item) => item !== keyword))} type="button">{keyword} ×</button>)}
                      </div>
                    ) : null}
                  </>
                ) : <p className="pos-filter-empty">ยังไม่มีเมนูที่ระบุเนื้อสัตว์</p>}
              </div>
              {servingContainerOptions.length > 0 ? (
                <div className="pos-subcategory-filter pos-serving-container-filter">
                  <div className="pos-subcategory-heading">
                    <span><strong>กรองภาชนะ</strong><small>เฉพาะถ้วยและหม้อ · ใช้ร่วมกับตัวกรองเนื้อสัตว์</small></span>
                    {normalizedServingContainerFilters.length > 0 ? <button className="filter-clear-button" onClick={() => setServingContainerFilters([])} type="button">ล้างตัวกรอง</button> : null}
                  </div>
                  <div aria-label="กรองภาชนะ" className="pos-subcategory-scroll" role="group">
                    <button aria-pressed={normalizedServingContainerFilters.length === 0} className={`subcategory-pill ${normalizedServingContainerFilters.length === 0 ? 'active' : ''}`} onClick={() => setServingContainerFilters([])} type="button">ทุกภาชนะ</button>
                    {servingContainerOptions.map((option) => {
                      const isSelected = normalizedServingContainerFilters.includes(option.keyword)
                      return <button key={option.keyword} aria-pressed={isSelected} className={`subcategory-pill ${isSelected ? 'active' : ''}`} onClick={() => setServingContainerFilters(isSelected ? [] : [option.keyword])} type="button">{option.keyword} <small>{option.productCount}</small></button>
                    })}
                  </div>
                  {normalizedServingContainerFilters.length > 0 ? (
                    <div aria-label="ตัวกรองภาชนะที่เลือก" className="pos-selected-filters">
                      <span>เลือกแล้ว:</span>
                      {normalizedServingContainerFilters.map((keyword) => <button className="selected-filter-chip" key={keyword} onClick={() => setServingContainerFilters((current) => current.filter((item) => item !== keyword))} type="button">{keyword} ×</button>)}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {riceSizeOptions.length > 0 ? (
                <div className="pos-subcategory-filter pos-rice-size-filter">
                  <div className="pos-subcategory-heading">
                    <span><strong>กรองขนาดข้าว</strong><small>เลือกได้ 1 รายการ · ใช้ร่วมกับตัวกรองเนื้อสัตว์</small></span>
                    {normalizedRiceSizeFilters.length > 0 ? <button className="filter-clear-button" onClick={() => setRiceSizeFilters([])} type="button">ล้างตัวกรอง</button> : null}
                  </div>
                  <div aria-label="กรองขนาดข้าว" className="pos-subcategory-scroll" role="group">
                    <button aria-pressed={normalizedRiceSizeFilters.length === 0} className={`subcategory-pill ${normalizedRiceSizeFilters.length === 0 ? 'active' : ''}`} onClick={() => setRiceSizeFilters([])} type="button">ทุกขนาด</button>
                    {riceSizeOptions.map((option) => {
                      const isSelected = normalizedRiceSizeFilters.includes(option.keyword)
                      return <button key={option.keyword} aria-pressed={isSelected} className={`subcategory-pill ${isSelected ? 'active' : ''}`} onClick={() => setRiceSizeFilters(isSelected ? [] : [option.keyword])} type="button">{option.keyword} <small>{option.productCount}</small></button>
                    })}
                  </div>
                  {normalizedRiceSizeFilters.length > 0 ? (
                    <div aria-label="ตัวกรองขนาดข้าวที่เลือก" className="pos-selected-filters">
                      <span>เลือกแล้ว:</span>
                      {normalizedRiceSizeFilters.map((keyword) => <button className="selected-filter-chip" key={keyword} onClick={() => setRiceSizeFilters((current) => current.filter((item) => item !== keyword))} type="button">{keyword} ×</button>)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            {/* Empty States */}
            {workspace.products.length === 0 && !workspace.isLoading ? (
              <div className="pos-empty-state">
                <p>ยังไม่มีรายการสินค้าในระบบ กรุณาให้ผู้จัดการเพิ่มสินค้าในเมนูสินค้า</p>
              </div>
            ) : null}

            {visibleProducts.length === 0 && workspace.products.length > 0 ? (
              <div className="pos-empty-state">
                <p>{searchQuery ? `ไม่พบรายการที่ค้นหา “${searchQuery}”` : 'ไม่พบสินค้าที่ตรงกับตัวกรองนี้'}</p>
                <button className="secondary-touch-button" onClick={() => { setSearchQuery(''); setCategoryFilter('ทั้งหมด'); setAnimalKeywordFilters([]); setServingContainerFilters([]); setRiceSizeFilters([]) }} type="button">
                  ดูสินค้าทั้งหมด
                </button>
              </div>
            ) : null}

            {favoriteProducts.length > 0 ? (
              <section aria-label="รายการโปรด" className="pos-favorite-section">
                <ProductGroupSection
                  cartQuantityByProductId={cartQuantityByProductId}
                  group={{ id: 'favorite-products', name: `★ รายการโปรด (${favoriteProducts.length})`, products: favoriteProducts }}
                  isFavoriteSection
                  isSubmitting={isSubmitting}
                  onAddProduct={handleAddProduct}
                />
              </section>
            ) : null}

            {/* Product Grid */}
            <div className="pos-product-grid">
              {productGroups.map((group) => (
                <ProductGroupSection
                  cartQuantityByProductId={cartQuantityByProductId}
                  group={group}
                  isSubmitting={isSubmitting}
                  key={group.id}
                  onAddProduct={handleAddProduct}
                />
              ))}
            </div>
          </section>

          {/* Mobile Drawer Backdrop */}
          {isMobileCartOpen ? (
            <div className="pos-drawer-backdrop" onClick={() => setIsMobileCartOpen(false)} />
          ) : null}

          {/* Right Column / Desktop Cart Panel / Mobile Bottom Sheet */}
          <aside aria-label="รายการในบิล" className={`pos-cart-panel ${isMobileCartOpen ? 'mobile-open' : ''}`}>
            <div className="pos-cart-header">
              <h3>บิล {workspace.selectedTable?.displayName} {workspace.order ? `(#${workspace.order.orderNumber})` : ''}</h3>
              <button aria-label="ปิดตะกร้า" className="cart-close-mobile" onClick={() => setIsMobileCartOpen(false)} type="button">
                ✕ ปิด
              </button>
            </div>

            {!workspace.order ? (
              <div className="cart-empty-box">
                <p>ยังไม่ได้เปิดบิล</p>
                <button className="primary-touch-button full-width" onClick={() => setActiveView('tables')} type="button">
                  เลือกโต๊ะเพื่อเปิดบิล
                </button>
              </div>
            ) : (
              <>
                {/* Items List */}
                <div className="cart-items-scroll">
                  {workspace.items.length === 0 ? (
                    <div className="cart-empty-box">
                      <p>ยังไม่มีรายการอาหาร แตะเลือกสินค้าเพื่อเพิ่มลงบิล</p>
                      <button className="secondary-touch-button full-width" disabled={isSubmitting} onClick={handleCancelEmptyOrder} type="button">
                        ยกเลิกบิลว่างและกลับผังโต๊ะ
                      </button>
                    </div>
                  ) : (
                    workspace.items.map((item) => (
                      <div key={item.id} className="cart-item-row">
                        <div className="cart-item-info">
                          <strong>{item.productName}</strong>
                          <span>{formatCurrency(item.unitPrice)}</span>
                        </div>

                        <div className="cart-quantity-group">
                          <button
                            aria-label={`ลด ${item.productName}`}
                            className="quantity-touch-btn"
                            disabled={isSubmitting}
                            onClick={() => handleQuantity(item.id, item.quantity - 1)}
                            type="button"
                          >
                            −
                          </button>
                          <span className="quantity-value">{item.quantity}</span>
                          <button
                            aria-label={`เพิ่ม ${item.productName}`}
                            className="quantity-touch-btn"
                            disabled={isSubmitting}
                            onClick={() => handleQuantity(item.id, item.quantity + 1)}
                            type="button"
                          >
                            +
                          </button>
                        </div>

                        <div className="cart-line-total">
                          <strong>{formatCurrency(item.lineTotal)}</strong>
                        </div>
                        <button
                          aria-label={`ลบ ${item.productName} ออกจากบิล`}
                          className="cart-remove-button"
                          disabled={isSubmitting}
                          onClick={() => handleQuantity(item.id, 0)}
                          title={`ลบ ${item.productName}`}
                          type="button"
                        >
                          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                            <path d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-8 0 1 13h8l1-13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Order Totals & Actions */}
                <div className="cart-totals-area">
                  <div className="total-row">
                    <span>ยอดอาหาร</span>
                    <span>{formatCurrency(workspace.order.subtotal)}</span>
                  </div>
                  {workspace.order.discount > 0 ? (
                    <div className="total-row discount">
                      <span>ส่วนลด</span>
                      <span>−{formatCurrency(workspace.order.discount)}</span>
                    </div>
                  ) : null}
                  <div className="total-row grand">
                    <span>ยอดสุทธิ</span>
                    <strong>{formatCurrency(workspace.order.total)}</strong>
                  </div>

                  <div className="cart-sub-actions">
                    {profile?.role === 'manager' ? (
                      <>
                        <button className="small-action-btn" disabled={isSubmitting} onClick={() => setShowDiscount(true)} type="button">
                          % ส่วนลด
                        </button>
                        {workspace.order.discount > 0 ? (
                          <button
                            className="small-action-btn"
                            disabled={isSubmitting}
                            onClick={() => void perform(async () => { await clearDiscount(workspace.order!.id); await workspace.refreshOrder(workspace.order!.id) })}
                            type="button"
                          >
                            ลบส่วนลด
                          </button>
                        ) : null}
                        <button className="small-action-btn danger" disabled={isSubmitting} onClick={() => setShowVoidDialog(true)} type="button">
                          ยกเลิกบิล
                        </button>
                      </>
                    ) : null}
                  </div>

                  <button
                    className="checkout-primary-button"
                    disabled={isSubmitting || workspace.items.length === 0}
                    onClick={openCheckoutPreview}
                    type="button"
                  >
                    {isSubmitting ? 'กำลังทำรายการ...' : `เช็กบิล (${formatCurrency(workspace.order.total)})`}
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {/* Mobile Sticky Bottom Cart Trigger Bar (Shown in menu view when order is open) */}
      {activeView === 'menu' && workspace.order && (
        <div className="mobile-sticky-cart-bar">
          <div
            className="sticky-info"
            onClick={() => setIsMobileCartOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setIsMobileCartOpen(true)
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className="sticky-count">🛒 {totalItemsCount} รายการ</span>
            <strong className="sticky-total">{formatCurrency(workspace.order.total)}</strong>
          </div>
          <button
            className="sticky-action-btn"
            disabled={isSubmitting}
            onClick={() => setIsMobileCartOpen(true)}
            type="button"
          >
            ดูตะกร้า / ชำระ ➜
          </button>
        </div>
      )}

      {/* Safe Void Confirmation Dialog (Replaces window.prompt) */}
      {showVoidDialog && workspace.order && (
        <div className="modal-backdrop">
          <div aria-modal="true" className="dialog-card danger-theme" role="dialog">
            <div className="dialog-header">
              <h3>ยืนยันการยกเลิกบิล #{workspace.order.orderNumber}</h3>
              <button aria-label="ปิดหน้าต่างยกเลิกบิล" className="dialog-close-btn" onClick={() => setShowVoidDialog(false)} type="button">✕</button>
            </div>
            <p className="dialog-warning-text">
              การยกเลิกบิลจะล้างรายการอาหารทั้งหมดและปิดบิลนี้ โปรดระบุเหตุผลเพื่อบันทึกประวัติ
            </p>
            <label className="pos-form-label" htmlFor="voidReasonInput">
              <span>เหตุผลการยกเลิก (จำเป็น)</span>
              <textarea
                id="voidReasonInput"
                className="pos-touch-textarea"
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="เช่น ลูกค้ายกเลิกออเดอร์, คีย์โต๊ะผิด..."
                rows={3}
                value={voidReason}
              />
            </label>
            <div className="pos-dialog-footer">
              <button className="secondary-touch-button" onClick={() => setShowVoidDialog(false)} type="button">
                กลับไปหน้าขาย
              </button>
              <button
                className="danger-touch-button"
                disabled={!voidReason.trim() || isSubmitting}
                onClick={confirmVoid}
                type="button"
              >
                ยืนยันยกเลิกบิล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Dialog */}
      {showDiscount && workspace.order && (
        <div className="modal-backdrop">
          <form className="dialog-card" onSubmit={submitDiscount}>
            <div className="dialog-header">
              <h3>กำหนดส่วนลด</h3>
              <button aria-label="ปิดหน้าต่างส่วนลด" className="dialog-close-btn" onClick={() => setShowDiscount(false)} type="button">✕</button>
            </div>
            <div className="pos-form-group">
              <label className="pos-form-label">
                <span>รูปแบบส่วนลด</span>
                <select
                  className="pos-touch-select"
                  onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')}
                  value={discountType}
                >
                  <option value="percent">เปอร์เซ็นต์ (%)</option>
                  <option value="fixed">จำนวนเงินบาท (฿)</option>
                </select>
              </label>

              <label className="pos-form-label" htmlFor={discountValueInputId}>
                <span>{discountType === 'percent' ? 'ระบุเปอร์เซ็นต์ (1-100)' : 'ระบุจำนวนเงิน (บาท)'}</span>
                <input
                  id={discountValueInputId}
                  className="pos-touch-input"
                  inputMode="decimal"
                  max={discountType === 'percent' ? 100 : (workspace.order?.subtotal ?? undefined)}
                  min="0.01"
                  onChange={(e) => setDiscountValue(e.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={discountValue}
                />
              </label>

              <label className="pos-form-label" htmlFor={discountReasonInputId}>
                <span>เหตุผลการให้ส่วนลด</span>
                <input
                  id={discountReasonInputId}
                  className="pos-touch-input"
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="เช่น ส่วนลดสมาชิก, โปรโมชั่นเปิดร้าน..."
                  required
                  type="text"
                  value={discountReason}
                />
              </label>
            </div>

            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setShowDiscount(false)} type="button">
                ยกเลิก
              </button>
              <button className="primary-button" disabled={isSubmitting} type="submit">
                บันทึกส่วนลด
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 1: Receipt Preview Modal */}
      {checkoutStep === 'preview' && receiptPreview && workspace.order ? (
        <ReceiptPreviewModal
          isSubmitting={isSubmitting}
          onCancel={handleCancelCheckout}
          onChooseMode={printPreviewAndContinue}
          preview={receiptPreview}
        />
      ) : null}

      {/* Step 2: Payment Modal with Big Touch Buttons */}
      {checkoutStep === 'payment' && workspace.order ? (
        <div className="modal-backdrop">
          <form className="dialog-card checkout-dialog" onSubmit={submitCheckout}>
            <div className="dialog-header">
              <h3>ชำระเงิน บิล #{workspace.order.orderNumber}</h3>
              <button aria-label="ปิดหน้าต่างชำระเงิน" className="dialog-close-btn" disabled={isSubmitting} onClick={handleCancelCheckout} type="button">✕</button>
            </div>

            <div className="checkout-amount-display">
              <span>ยอดชำระสุทธิ</span>
              <strong>{formatCurrency(workspace.order.total)}</strong>
            </div>

            {/* Payment Method Big Cards */}
            <div className="payment-methods-grid">
              <button
                className={`payment-method-card ${paymentMethod === 'cash' ? 'selected' : ''}`}
                onClick={() => setPaymentMethod('cash')}
                type="button"
              >
                <span className="method-icon">💵</span>
                <strong>เงินสด</strong>
              </button>
              <button
                className={`payment-method-card ${paymentMethod === 'transfer' ? 'selected' : ''}`}
                onClick={() => setPaymentMethod('transfer')}
                type="button"
              >
                <span className="method-icon">📱</span>
                <strong>เงินโอน / QR</strong>
              </button>
            </div>

            {paymentMethod === 'cash' ? (
              <div className="cash-payment-section">
                <label className="pos-form-label" htmlFor={receivedAmountInputId}>
                  <span>จำนวนเงินที่รับมา</span>
                  <input
                    id={receivedAmountInputId}
                    autoFocus
                    className="pos-touch-input highlight"
                    inputMode="decimal"
                    min={workspace.order.total}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    step="0.01"
                    type="number"
                    value={receivedAmount}
                  />
                </label>

                {/* Smart Quick Amount Buttons */}
                <div className="quick-cash-row">
                  {smartCashOptions.map((amount) => (
                    <button
                      key={amount}
                      className="quick-cash-btn"
                      onClick={() => setReceivedAmount(String(amount))}
                      type="button"
                    >
                      {amount === workspace.order?.total ? `พอดี (${amount})` : amount}
                    </button>
                  ))}
                </div>

                {/* Big Change Display */}
                <div className="change-display-box">
                  <span>เงินทอน</span>
                  <strong>{formatCurrency(estimatedChange)}</strong>
                </div>
              </div>
            ) : (
              <div className="transfer-payment-section">
                <label className="pos-form-label">
                  <span>เลขอ้างอิงสลิปโอนเงิน (ถ้ามี)</span>
                  <input
                    className="pos-touch-input"
                    onChange={(e) => setTransferReference(e.target.value)}
                    placeholder="เลขอ้างอิง 4-6 หลักสุดท้าย"
                    type="text"
                    value={transferReference}
                  />
                </label>
                <label className="transfer-confirm-checkbox">
                  <input
                    checked={transferConfirmed}
                    onChange={(e) => setTransferConfirmed(e.target.checked)}
                    required
                    type="checkbox"
                  />
                  <span>ตรวจสอบยอดเงินเข้าบัญชีเรียบร้อยแล้ว</span>
                </label>
              </div>
            )}

            <div className="pos-dialog-footer">
              <button className="secondary-touch-button" disabled={isSubmitting} onClick={handleCancelCheckout} type="button">
                ย้อนกลับ
              </button>
              <button
                className="primary-touch-button big"
                disabled={isSubmitting || !isPaymentValid}
                type="submit"
              >
                {isSubmitting ? 'กำลังบันทึก...' : '✓ ยืนยันรับเงิน'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

interface ProductGroupSectionProps {
  readonly cartQuantityByProductId: ReadonlyMap<string | null, number>
  readonly group: ProductGroup
  readonly isFavoriteSection?: boolean
  readonly isSubmitting: boolean
  readonly onAddProduct: (productId: string) => void
}

function ProductGroupSection({ cartQuantityByProductId, group, isFavoriteSection = false, isSubmitting, onAddProduct }: ProductGroupSectionProps) {
  return (
    <section aria-label={`กลุ่มเมนู ${group.name}`} className={`pos-product-group${isFavoriteSection ? ' favorite' : ''}`}>
      <h3 className="pos-product-group-title">{group.name}</h3>
      <div className="pos-product-row">
        {group.products.map((product) => {
          const inCartCount = cartQuantityByProductId.get(product.id) ?? 0
          return (
            <button
              key={product.id}
              aria-label={`${product.name} ราคา ${formatCurrency(product.price)}${inCartCount > 0 ? ` ในบิลแล้ว ${inCartCount} ชิ้น` : ''}`}
              className={`product-touch-card ${inCartCount > 0 ? 'in-cart' : ''}`}
              disabled={isSubmitting}
              onClick={() => onAddProduct(product.id)}
              type="button"
            >
              {inCartCount > 0 ? <span className="product-cart-badge">{inCartCount}</span> : null}
              <span className="product-name">{product.name}</span>
              <strong className="product-price">{formatCurrency(product.price)}</strong>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ReceiptPreviewModal({
  preview,
  isSubmitting,
  onCancel,
  onChooseMode,
}: {
  readonly preview: ReceiptPreview
  readonly isSubmitting: boolean
  readonly onCancel: () => void
  readonly onChooseMode: (mode: ReceiptMode) => void
}) {
  const isRestaurant = preview.mode === 'shop'
  return (
    <div className="modal-backdrop">
      <section aria-modal="true" className="dialog-card receipt-preview-dialog" role="dialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">ขั้นที่ 1</p>
            <h3>Preview บิลก่อนชำระเงิน (#{preview.orderNumber})</h3>
          </div>
          <button aria-label="ปิดหน้าต่างตรวจสอบบิล" className="dialog-close-btn" disabled={isSubmitting} onClick={onCancel} type="button">✕</button>
        </div>

        <article className={`receipt-preview ${isRestaurant ? 'restaurant' : 'field'}`}>
          {isRestaurant ? (
            <header>
              <strong>{preview.store.storeName}</strong>
              {preview.store.phone ? <span>โทร: {preview.store.phone}</span> : null}
              <span>บิล #{preview.orderNumber} · โต๊ะ {preview.tableName}</span>
            </header>
          ) : null}

          <div className="receipt-preview-items">
            <div className="receipt-preview-item receipt-preview-head">
              <span>รายการอาหาร</span>
              <span>ราคา</span>
              <span>จำนวน</span>
              <span>รวม</span>
            </div>
            {preview.items.map((item) => (
              <div key={item.id} className="receipt-preview-item">
                <span>{item.productName}</span>
                <span>{formatCurrency(item.unitPrice)}</span>
                <span>{item.quantity}</span>
                <strong>{formatCurrency(item.lineTotal)}</strong>
              </div>
            ))}
          </div>

          {isRestaurant ? (
            <footer>
              <div>
                <span>ยอดอาหาร</span>
                <strong>{formatCurrency(preview.subtotal)}</strong>
              </div>
              {preview.discount > 0 ? (
                <div>
                  <span>ส่วนลด</span>
                  <strong>−{formatCurrency(preview.discount)}</strong>
                </div>
              ) : null}
              <div className="receipt-preview-total">
                <span>รวมสุทธิ</span>
                <strong>{formatCurrency(preview.total)}</strong>
              </div>

              {preview.store.paymentQrPath ? (
                <div className="receipt-preview-qr">
                  <img alt="QR สำหรับชำระเงิน" src={preview.store.paymentQrPath} />
                  <div>
                    {preview.store.bankPaymentLabel ? <span>{preview.store.bankPaymentLabel}</span> : null}
                    {preview.store.bankAccountName ? <span>{preview.store.bankAccountName}</span> : null}
                    {preview.store.bankAccountNumber ? <span>{preview.store.bankAccountNumber}</span> : null}
                    {preview.store.bankReference ? <span>{preview.store.bankReference}</span> : null}
                  </div>
                </div>
              ) : (
                <p className="muted">ยังไม่ได้ตั้งค่ารูป QR ชำระเงิน</p>
              )}

              {preview.store.receiptFooter ? (
                <small>{preview.store.receiptFooter}</small>
              ) : null}
            </footer>
          ) : null}
        </article>

        <p className="muted">เลือกรูปแบบการพิมพ์เพื่อส่งบิลเข้าคิว จากนั้นระบบจะไปขั้นที่ 2 เลือกวิธีชำระเงิน</p>

        <div className="dialog-actions">
          <button className="secondary-button" disabled={isSubmitting} onClick={onCancel} type="button">
            ยกเลิก
          </button>
          <button className="primary-button" disabled={isSubmitting} onClick={() => onChooseMode('shop')} type="button">
            ร้านอาหาร · พิมพ์เต็มรูปแบบ
          </button>
          <button className="secondary-button" disabled={isSubmitting} onClick={() => onChooseMode('field')} type="button">
            สนามฟุตบอล · รายการอาหาร
          </button>
        </div>
      </section>
    </div>
  )
}
