import type { SalesReport } from '../reports/reportTypes'

export type ExpenseKind = 'general' | 'wage'

export interface Employee {
  readonly id: string
  readonly name: string
  readonly dailyWage: number
  readonly active: boolean
}

export interface DailyWageRow {
  readonly employeeId: string
  readonly employeeName: string
  readonly dailyWage: number
  readonly employeeActive: boolean
  readonly expenseId: string | null
  readonly selected: boolean
  readonly status: 'active' | 'void' | null
}

export interface ExpenseRow {
  readonly id: string
  readonly kind: ExpenseKind
  readonly employeeId: string | null
  readonly employeeName: string | null
  readonly expenseDate: string
  readonly createdAt: string
  readonly amount: number
  readonly note: string | null
  readonly status: 'active' | 'void'
}

export interface ExpenseSummary {
  readonly total: number
  readonly cashTotal: number
  readonly transferTotal: number
  readonly generalTotal: number
  readonly wageTotal: number
  readonly byCategory: readonly { readonly categoryName: string; readonly total: number }[]
  readonly byEmployee: readonly { readonly employeeName: string; readonly total: number }[]
}

export interface FinancialReport {
  readonly sales: SalesReport
  readonly expenses: ExpenseSummary
  readonly netAfterExpenses: number
}
