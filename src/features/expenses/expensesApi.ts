import { supabase } from '../../lib/supabase'
import type { DailyWageRow, Employee, ExpenseKind, ExpenseRow, FinancialReport } from './expenseTypes'
import { mapFinancialReport } from './financialReportMapper'
import type { FinancialReportRpc } from './financialReportMapper'

interface EmployeeRpc { readonly id: string; readonly name: string; readonly daily_wage: number | string; readonly active: boolean }
interface DailyWageRpc {
  readonly employee_id: string
  readonly employee_name: string
  readonly daily_wage: number | string
  readonly employee_active: boolean
  readonly expense_id: string | null
  readonly selected: boolean
  readonly status: 'active' | 'void' | null
}
interface ExpenseRpc {
  readonly id: string
  readonly kind: ExpenseKind
  readonly employee_id: string | null
  readonly employee_name: string | null
  readonly expense_date: string
  readonly created_at?: string
  readonly amount: number | string
  readonly note: string | null
  readonly status: ExpenseRow['status']
}
interface CombinedSaveRpc {
  readonly date: string
  readonly general_expense: ExpenseRpc | null
  readonly wages: readonly ExpenseRpc[]
  readonly general_saved: boolean
  readonly wages_saved: boolean
  readonly total_amount: number | string
}
export interface CombinedSaveResult {
  readonly date: string
  readonly generalExpense: ExpenseRow | null
  readonly wages: readonly ExpenseRow[]
  readonly generalSaved: boolean
  readonly wagesSaved: boolean
  readonly totalAmount: number
}

function client() { if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase'); return supabase }
function number(value: number | string) { return typeof value === 'number' ? value : Number(value) }
function employee(row: EmployeeRpc): Employee { return { id: row.id, name: row.name, dailyWage: number(row.daily_wage), active: row.active } }
function dailyWage(row: DailyWageRpc): DailyWageRow { return { employeeId: row.employee_id, employeeName: row.employee_name, dailyWage: number(row.daily_wage), employeeActive: row.employee_active, expenseId: row.expense_id, selected: row.selected, status: row.status } }
function expense(row: ExpenseRpc): ExpenseRow { return { id: row.id, kind: row.kind, employeeId: row.employee_id, employeeName: row.employee_name, expenseDate: row.expense_date, createdAt: row.created_at ?? '', amount: number(row.amount), note: row.note, status: row.status } }

export async function loadEmployees(): Promise<Employee[]> {
  const { data, error } = await client().rpc('list_employees')
  if (error) throw error
  return (data as unknown as readonly EmployeeRpc[]).map(employee)
}

export async function saveEmployee(id: string | null, name: string, dailyWage: number) {
  const { data, error } = id
    ? await client().rpc('save_employee', { p_id: id, p_name: name, p_daily_wage: dailyWage })
    : await client().rpc('create_employee', { p_name: name, p_daily_wage: dailyWage })
  if (error) throw error
  return employee(data as unknown as EmployeeRpc)
}

export async function setEmployeeActive(id: string, active: boolean) {
  const { data, error } = await client().rpc('set_employee_active', { p_id: id, p_active: active })
  if (error) throw error
  return employee(data as unknown as EmployeeRpc)
}

export async function saveExpenseAndDailyWages(
  date: string,
  generalAmount: number | null,
  generalNote: string,
  employeeIds: readonly string[] | null,
  clientRequestId: string | null,
): Promise<CombinedSaveResult> {
  const { data, error } = await client().rpc('save_expense_and_daily_wages', {
    p_date: date,
    p_general_amount: generalAmount ?? undefined,
    p_general_note: generalNote,
    p_employee_ids: employeeIds ? [...employeeIds] : undefined,
    p_client_request_id: clientRequestId ?? undefined,
  })
  if (error) throw error
  const payload = data as unknown as CombinedSaveRpc
  return {
    date: payload.date,
    generalExpense: payload.general_expense ? expense(payload.general_expense) : null,
    wages: payload.wages.map(expense),
    generalSaved: payload.general_saved,
    wagesSaved: payload.wages_saved,
    totalAmount: number(payload.total_amount),
  }
}

export async function loadDailyWages(date: string): Promise<DailyWageRow[]> {
  const { data, error } = await client().rpc('list_daily_wages', { p_date: date })
  if (error) throw error
  return (data as unknown as readonly DailyWageRpc[]).map(dailyWage)
}

export async function voidExpense(id: string, reason: string) {
  const { error } = await client().rpc('void_expense', { p_id: id, p_reason: reason })
  if (error) throw error
}

export async function loadExpensesPage(from: string, to: string, cursor: { readonly expenseDate: string; readonly createdAt: string; readonly id: string } | null): Promise<{ rows: ExpenseRow[]; hasMore: boolean }> {
  const { data, error } = await client().rpc('list_expenses_page', {
    p_from: from,
    p_to: to,
    p_cursor_date: cursor?.expenseDate,
    p_cursor_created_at: cursor?.createdAt,
    p_cursor_id: cursor?.id,
    p_limit: 25,
  })
  if (error) throw error
  const rows = (data as unknown as readonly (ExpenseRpc & { readonly created_at: string })[]).map(expense)
  return { rows: rows.slice(0, 25), hasMore: rows.length > 25 }
}

export async function loadExpenseTotal(from: string, to: string): Promise<number> {
  const { data, error } = await client().rpc('get_expense_total', { p_from: from, p_to: to })
  if (error) throw error
  return number(data as number | string)
}

export async function loadFinancialReport(from: string, to: string): Promise<FinancialReport> {
  const { data, error } = await client().rpc('get_financial_report', { p_from: from, p_to: to })
  if (error) throw error
  return mapFinancialReport(data as unknown as FinancialReportRpc)
}
