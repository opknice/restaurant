import { useCallback, useEffect, useRef, useState } from 'react'
import { loadOrder, loadProducts, loadSalesTables } from './salesApi'
import type { Order, OrderItem, Product, SalesTable } from './salesTypes'
import { supabase } from '../../lib/supabase'
import { readSalesDraft, updateSalesDraft } from './salesPersistence'

export function useSalesWorkspace(userId: string | null = null) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [items, setItems] = useState<OrderItem[]>([])
  const [order, setOrder] = useState<Order | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedTable, setSelectedTable] = useState<SalesTable | null>(null)
  const [tables, setTables] = useState<SalesTable[]>([])
  const selectionSequence = useRef(0)
  const tableRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const orderItemRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const productRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tablePollingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const productPollingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const orderIdRef = useRef<string | null>(null)
  const preferredTableIdRef = useRef<string | null>(null)
  const restoredSnapshotRef = useRef(false)
  const lastVisibilityRefreshRef = useRef(0)
  const workspaceRunIdRef = useRef(0)
  const pollingOrderIdRef = useRef<string | null>(null)
  const refreshSequenceRef = useRef(0)

  const refreshTables = useCallback(async () => {
    const runId = workspaceRunIdRef.current
    const nextTables = await loadSalesTables()
    if (runId !== workspaceRunIdRef.current) return
    setTables(nextTables)
    setSelectedTable((current) => current ? nextTables.find((table) => table.id === current.id) ?? null : null)
  }, [])

  const refreshTablesAndProducts = useCallback(async () => {
    const runId = workspaceRunIdRef.current
    const [nextTables, nextProducts] = await Promise.all([loadSalesTables(), loadProducts()])
    if (runId !== workspaceRunIdRef.current) return null
    setTables(nextTables)
    setProducts(nextProducts)
    setSelectedTable((current) => {
      const tableId = current?.id ?? (!restoredSnapshotRef.current ? preferredTableIdRef.current : null)
      return tableId ? nextTables.find((table) => table.id === tableId) ?? null : null
    })
    return { nextTables, nextProducts }
  }, [])

  const refreshProducts = useCallback(async () => {
    const runId = workspaceRunIdRef.current
    const nextProducts = await loadProducts()
    if (runId !== workspaceRunIdRef.current) return
    setProducts(nextProducts)
  }, [])

  const refreshOrder = useCallback(async (orderId: string) => {
    const runId = workspaceRunIdRef.current
    const sequence = selectionSequence.current
    const result = await loadOrder(orderId)
    if (runId !== workspaceRunIdRef.current || selectionSequence.current !== sequence) return
    if (result.order.status !== 'open') {
      if (orderIdRef.current === orderId) {
        setOrder(null)
        setItems([])
      }
      return
    }
    setOrder(result.order)
    setItems(result.items)
  }, [])

  useEffect(() => { orderIdRef.current = order?.id ?? null }, [order])

  const refreshAll = useCallback(async () => {
    const sequence = ++refreshSequenceRef.current
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const loaded = await refreshTablesAndProducts()
      if (!loaded) return
      const { nextTables } = loaded
      if (!restoredSnapshotRef.current) {
        restoredSnapshotRef.current = true
        const saved = readSalesDraft(userId)
        const table = saved?.selectedTableId
          ? nextTables.find((candidate) => candidate.id === saved.selectedTableId) ?? null
          : null
        if (table) {
          setSelectedTable(table)
          if (table.openOrderId && table.openOrderId === saved?.orderId) {
            await refreshOrder(table.openOrderId)
          }
        }
      } else if (orderIdRef.current) {
        await refreshOrder(orderIdRef.current)
      }
    } catch (error: unknown) {
      if (sequence === refreshSequenceRef.current) {
        setErrorMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ')
      }
    } finally {
      if (sequence === refreshSequenceRef.current) setIsLoading(false)
    }
  }, [refreshOrder, refreshTablesAndProducts, userId])

  useEffect(() => {
    // Defer the initial fetch so the effect only starts asynchronous I/O.
    void Promise.resolve().then(refreshAll)
  }, [refreshAll, userId])

  useEffect(() => {
    if (!restoredSnapshotRef.current) return
    updateSalesDraft(userId, {
      selectedTableId: selectedTable?.id ?? null,
      orderId: order?.id ?? null,
    })
  }, [order?.id, selectedTable?.id, userId])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastVisibilityRefreshRef.current < 1500) return
      lastVisibilityRefreshRef.current = now
      void refreshAll()
    }

    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('pageshow', refreshWhenVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('pageshow', refreshWhenVisible)
    }
  }, [refreshAll])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    // Realtime is the fast path; this low-frequency poll keeps two devices in
    // sync when a browser/network drops a Realtime websocket silently.
    const pollCurrentOrder = () => {
      if (document.visibilityState === 'hidden') return
      const currentOrderId = orderIdRef.current
      if (!currentOrderId || pollingOrderIdRef.current === currentOrderId) return
      pollingOrderIdRef.current = currentOrderId
      void refreshOrder(currentOrderId)
        .catch((error: unknown) => {
          setErrorMessage(error instanceof Error ? error.message : 'ตรวจสอบบิลล่าสุดไม่สำเร็จ')
        })
        .finally(() => {
          if (pollingOrderIdRef.current === currentOrderId) pollingOrderIdRef.current = null
        })
    }

    const timer = window.setInterval(pollCurrentOrder, 2000)
    return () => {
      window.clearInterval(timer)
      pollingOrderIdRef.current = null
    }
  }, [refreshOrder])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    // Realtime is the fast path. These low-frequency checks also recover table
    // status and catalog changes when a browser keeps a stale WebSocket alive.
    const refreshTablesWhenVisible = () => {
      if (document.visibilityState === 'hidden') return
      void refreshTables().catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : 'ตรวจสอบสถานะโต๊ะล่าสุดไม่สำเร็จ')
      })
    }
    const refreshProductsWhenVisible = () => {
      if (document.visibilityState === 'hidden') return
      void refreshProducts().catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : 'ตรวจสอบรายการอาหารล่าสุดไม่สำเร็จ')
      })
    }

    tablePollingTimer.current = window.setInterval(refreshTablesWhenVisible, 5000)
    productPollingTimer.current = window.setInterval(refreshProductsWhenVisible, 15000)
    return () => {
      if (tablePollingTimer.current) window.clearInterval(tablePollingTimer.current)
      if (productPollingTimer.current) window.clearInterval(productPollingTimer.current)
      tablePollingTimer.current = null
      productPollingTimer.current = null
    }
  }, [refreshProducts, refreshTables])

  useEffect(() => {
    const client = supabase
    if (!client) return undefined
    let channelActive = true
    const realtimeErrorMessage = 'การซิงก์ข้อมูลแบบเรียลไทม์ขัดข้อง ระบบกำลังตรวจสอบข้อมูลสำรอง'
    const channel = client
      .channel('sales-table-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (tableRefreshTimer.current) clearTimeout(tableRefreshTimer.current)
        tableRefreshTimer.current = setTimeout(() => {
          tableRefreshTimer.current = null
          void refreshTables().catch((error: unknown) => {
            setErrorMessage(error instanceof Error ? error.message : 'อัปเดตสถานะโต๊ะไม่สำเร็จ')
          })
          const changedOrderId = String((payload.new as { id?: string } | null)?.id ?? (payload.old as { id?: string } | null)?.id ?? '')
          if (changedOrderId && changedOrderId === orderIdRef.current) {
            void refreshOrder(changedOrderId).catch((error: unknown) => {
              setErrorMessage(error instanceof Error ? error.message : 'อัปเดตบิลไม่สำเร็จ')
            })
          }
        }, 250)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, (payload) => {
        if (orderItemRefreshTimer.current) clearTimeout(orderItemRefreshTimer.current)
        orderItemRefreshTimer.current = setTimeout(() => {
          orderItemRefreshTimer.current = null
          const changedOrderId = String((payload.new as { order_id?: string } | null)?.order_id ?? (payload.old as { order_id?: string } | null)?.order_id ?? '')
          if (changedOrderId && changedOrderId !== orderIdRef.current) return
          const currentOrderId = orderIdRef.current
          if (!currentOrderId) return
          void refreshOrder(currentOrderId).catch((error: unknown) => {
            setErrorMessage(error instanceof Error ? error.message : 'อัปเดตรายการอาหารไม่สำเร็จ')
          })
        }, 150)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        if (productRefreshTimer.current) clearTimeout(productRefreshTimer.current)
        productRefreshTimer.current = setTimeout(() => {
          productRefreshTimer.current = null
          void refreshProducts().catch((error: unknown) => {
            setErrorMessage(error instanceof Error ? error.message : 'อัปเดตรายการอาหารไม่สำเร็จ')
          })
        }, 250)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        if (productRefreshTimer.current) clearTimeout(productRefreshTimer.current)
        productRefreshTimer.current = setTimeout(() => {
          productRefreshTimer.current = null
          void refreshProducts().catch((error: unknown) => {
            setErrorMessage(error instanceof Error ? error.message : 'อัปเดตรายการอาหารไม่สำเร็จ')
          })
        }, 250)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subcategories' }, () => {
        if (productRefreshTimer.current) clearTimeout(productRefreshTimer.current)
        productRefreshTimer.current = setTimeout(() => {
          productRefreshTimer.current = null
          void refreshProducts().catch((error: unknown) => {
            setErrorMessage(error instanceof Error ? error.message : 'อัปเดตหัวข้อสินค้าไม่สำเร็จ')
          })
        }, 250)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_subcategories' }, () => {
        if (productRefreshTimer.current) clearTimeout(productRefreshTimer.current)
        productRefreshTimer.current = setTimeout(() => {
          productRefreshTimer.current = null
          void refreshProducts().catch((error: unknown) => {
            setErrorMessage(error instanceof Error ? error.message : 'อัปเดตหัวข้อสินค้าที่เลือกไม่สำเร็จ')
          })
        }, 250)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, () => {
        if (tableRefreshTimer.current) clearTimeout(tableRefreshTimer.current)
        tableRefreshTimer.current = setTimeout(() => {
          tableRefreshTimer.current = null
          void refreshTables().catch((error: unknown) => {
            setErrorMessage(error instanceof Error ? error.message : 'อัปเดตข้อมูลโต๊ะไม่สำเร็จ')
          })
        }, 250)
      })
      .subscribe((status) => {
        if (!channelActive) return
        if (status === 'SUBSCRIBED') {
          setErrorMessage((current) => current === realtimeErrorMessage ? null : current)
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setErrorMessage(realtimeErrorMessage)
        }
      })
    return () => {
      channelActive = false
      if (tableRefreshTimer.current) clearTimeout(tableRefreshTimer.current)
      if (orderItemRefreshTimer.current) clearTimeout(orderItemRefreshTimer.current)
      if (productRefreshTimer.current) clearTimeout(productRefreshTimer.current)
      void client.removeChannel(channel)
    }
  }, [refreshOrder, refreshProducts, refreshTables])

  const chooseTable = useCallback(async (table: SalesTable) => {
    const runId = workspaceRunIdRef.current
    const sequence = selectionSequence.current + 1
    selectionSequence.current = sequence
    setSelectedTable(table)
    preferredTableIdRef.current = table.id
    setOrder(null)
    setItems([])
    setErrorMessage(null)
    if (!table.openOrderId) return
    try {
      const result = await loadOrder(table.openOrderId)
      if (runId !== workspaceRunIdRef.current || selectionSequence.current !== sequence) return
      if (result.order.status !== 'open') return
      setOrder(result.order)
      setItems(result.items)
    } catch (error: unknown) {
      if (selectionSequence.current !== sequence) return
      setErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถเปิดบิลนี้ได้')
    }
  }, [])

  return {
    errorMessage,
    isLoading,
    items,
    order,
    products,
    refreshAll,
    refreshTables,
    refreshOrder,
    selectedTable,
    setErrorMessage,
    setItems,
    setOrder,
    setSelectedTable,
    tables,
    chooseTable,
  }
}
