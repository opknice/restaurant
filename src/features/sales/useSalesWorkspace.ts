import { useCallback, useEffect, useState } from 'react'
import { loadOrder, loadProducts, loadSalesTables } from './salesApi'
import type { Order, OrderItem, Product, SalesTable } from './salesTypes'
import { supabase } from '../../lib/supabase'

export function useSalesWorkspace() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [items, setItems] = useState<OrderItem[]>([])
  const [order, setOrder] = useState<Order | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedTable, setSelectedTable] = useState<SalesTable | null>(null)
  const [tables, setTables] = useState<SalesTable[]>([])

  const refreshTablesAndProducts = useCallback(async () => {
    const [nextTables, nextProducts] = await Promise.all([loadSalesTables(), loadProducts()])
    setTables(nextTables)
    setProducts(nextProducts)
    setSelectedTable((current) => current ? nextTables.find((table) => table.id === current.id) ?? null : null)
  }, [])

  const refreshOrder = useCallback(async (orderId: string) => {
    const result = await loadOrder(orderId)
    setOrder(result.order)
    setItems(result.items)
  }, [])

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      await refreshTablesAndProducts()
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ')
    } finally {
      setIsLoading(false)
    }
  }, [refreshTablesAndProducts])

  useEffect(() => {
    // Defer the initial fetch so the effect only starts asynchronous I/O.
    void Promise.resolve().then(refreshAll)
  }, [refreshAll])

  useEffect(() => {
    const client = supabase
    if (!client) return undefined
    const channel = client
      .channel('sales-table-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void refreshTablesAndProducts() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [refreshTablesAndProducts])

  const chooseTable = useCallback(async (table: SalesTable) => {
    setSelectedTable(table)
    setOrder(null)
    setItems([])
    setErrorMessage(null)
    if (!table.openOrderId) return
    try {
      await refreshOrder(table.openOrderId)
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'ไม่สามารถเปิดบิลนี้ได้')
    }
  }, [refreshOrder])

  return {
    errorMessage,
    isLoading,
    items,
    order,
    products,
    refreshAll,
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
