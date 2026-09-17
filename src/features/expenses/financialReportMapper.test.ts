import { describe, expect, it } from 'vitest'
import { mapFinancialReport } from './financialReportMapper'
import type { FinancialReportRpc } from './financialReportMapper'

const rpcPayload: FinancialReportRpc = {
  sales: {
    summary: {
      paid_order_count: 1,
      void_order_count: 0,
      refunded_order_count: 2,
      sales_total: '300.00',
      discount_total: '0.00',
      refund_total: '0.00',
      net_total: '300.00',
      cash_total: '300.00',
      transfer_total: '0.00',
    },
    products: [
      { product_name: 'ข้าวผัด', category_name: 'อาหาร', quantity: '2', total: '300.00' },
    ],
    sellers: [{ seller_name: 'ผู้จัดการ', bill_count: 1, total: '300.00' }],
    tables: [{ table_name: 'โต๊ะ 1', bill_count: '1', total: '300.00' }],
  },
  expenses: {
    total: '1320.00',
    cash_total: '1320.00',
    transfer_total: '0.00',
    general_total: '320.00',
    wage_total: '1000.00',
    by_category: [{ category_name: 'ค่าแรงพนักงาน', total: '1000.00' }, { category_name: 'รายจ่ายทั่วไป', total: '320.00' }],
    by_employee: [{ employee_name: 'พนักงานหนึ่ง', total: '1000.00' }],
  },
  net_after_expenses: '-1020.00',
}

describe('mapFinancialReport', () => {
  it('แปลงข้อมูล snake_case จาก Supabase โดยไม่เกิด NaN หรือ undefined', () => {
    const report = mapFinancialReport(rpcPayload)

    expect(report.sales.summary.netTotal).toBe(300)
    expect(report.sales.summary.paidOrderCount).toBe(1)
    expect(report.sales.summary.refundedOrderCount).toBe(2)
    expect(report.sales.products[0]).toMatchObject({ productName: 'ข้าวผัด', quantity: 2, total: 300 })
    expect(report.sales.sellers[0]).toMatchObject({ sellerName: 'ผู้จัดการ', billCount: 1 })
    expect(report.sales.tables[0]).toMatchObject({ tableName: 'โต๊ะ 1', billCount: 1 })
    expect(report.expenses.total).toBe(1320)
    expect(report.expenses.generalTotal).toBe(320)
    expect(report.expenses.wageTotal).toBe(1000)
    expect(report.netAfterExpenses).toBe(-1020)
    expect(Number.isFinite(report.sales.summary.cashTotal)).toBe(true)
  })

  it('เปลี่ยนค่าตัวเลขที่ผิดรูปแบบเป็นศูนย์อย่างปลอดภัย', () => {
    const report = mapFinancialReport({
      ...rpcPayload,
      sales: { ...rpcPayload.sales, summary: { ...rpcPayload.sales.summary, net_total: 'not-a-number' } },
      expenses: { ...rpcPayload.expenses, total: 'invalid' },
      net_after_expenses: 'invalid',
    })
    expect(report.sales.summary.netTotal).toBe(0)
    expect(report.expenses.total).toBe(0)
    expect(report.netAfterExpenses).toBe(0)
  })
})
