import { supabase } from '../../lib/supabase'

export type PrintStatus = 'pending' | 'printing' | 'printed' | 'failed' | 'review_required' | 'cancelled'

export interface PrintQueueRow {
  readonly id: string
  readonly orderId: string
  readonly printStatus: PrintStatus
  readonly printAttempts: number
  readonly lastError: string | null
  readonly createdAt: string
  readonly claimedBy: string | null
}

interface PrintRowRpc {
  readonly id: string
  readonly order_id: string
  readonly print_status: PrintStatus
  readonly print_attempts: number | string
  readonly last_error: string | null
  readonly created_at: string
  readonly print_claimed_by: string | null
}

function client() {
  if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase')
  return supabase
}

function mapRow(row: PrintRowRpc): PrintQueueRow {
  return { id: row.id, orderId: row.order_id, printStatus: row.print_status, printAttempts: Number(row.print_attempts), lastError: row.last_error, createdAt: row.created_at, claimedBy: row.print_claimed_by }
}

export async function loadPrintQueue(): Promise<PrintQueueRow[]> {
  const { data, error } = await client().rpc('list_print_queue')
  if (error) throw error
  return (data as unknown as readonly PrintRowRpc[]).map(mapRow)
}

export async function requeueReceipt(receiptId: string): Promise<void> {
  const { error } = await client().rpc('manager_requeue_receipt', { p_receipt_id: receiptId })
  if (error) throw error
}

export async function markReceiptPrinted(receiptId: string): Promise<void> {
  const { error } = await client().rpc('manager_mark_receipt_printed', { p_receipt_id: receiptId })
  if (error) throw error
}

export async function cancelReceipt(receiptId: string): Promise<void> {
  const { error } = await client().rpc('manager_cancel_receipt', { p_receipt_id: receiptId })
  if (error) throw error
}
