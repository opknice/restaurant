import type { ExpenseSummary, FinancialReport } from './expenseTypes'
import { mapSalesReport, reportNumber } from '../reports/salesReportMapper'
import type { SalesReportRpc } from '../reports/salesReportMapper'

interface ExpenseTotalRpc {
  readonly total: number | string
  readonly cash_total: number | string
  readonly transfer_total: number | string
  readonly general_total?: number | string
  readonly wage_total?: number | string
  readonly by_category: readonly {
    readonly category_name: string
    readonly total: number | string
  }[]
  readonly by_employee: readonly {
    readonly employee_name: string
    readonly total: number | string
  }[]
}

export interface FinancialReportRpc {
  readonly sales: SalesReportRpc
  readonly expenses: ExpenseTotalRpc
  readonly net_after_expenses: number | string
}

/** แปลงชื่อฟิลด์และตัวเลขจาก PostgreSQL ให้เป็นรูปแบบที่ UI ใช้งานอย่างปลอดภัย */
export function mapFinancialReport(payload: FinancialReportRpc): FinancialReport {
  const expenses: ExpenseSummary = {
    total: reportNumber(payload.expenses.total),
    cashTotal: reportNumber(payload.expenses.cash_total),
    transferTotal: reportNumber(payload.expenses.transfer_total),
    generalTotal: reportNumber(payload.expenses.general_total ?? 0),
    wageTotal: reportNumber(payload.expenses.wage_total ?? 0),
    byCategory: payload.expenses.by_category.map((row) => ({
      categoryName: row.category_name,
      total: reportNumber(row.total),
    })),
    byEmployee: payload.expenses.by_employee.map((row) => ({
      employeeName: row.employee_name,
      total: reportNumber(row.total),
    })),
  }

  return {
    sales: mapSalesReport(payload.sales),
    expenses,
    netAfterExpenses: reportNumber(payload.net_after_expenses),
  }
}
