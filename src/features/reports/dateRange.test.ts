import { describe, expect, it } from 'vitest'
import { isValidDateRange, toBangkokEnd } from './dateRange'

describe('date range validation', () => {
  it('accepts an inclusive same-day range and rejects reversed dates', () => {
    expect(isValidDateRange('2026-09-16', '2026-09-16')).toBe(true)
    expect(isValidDateRange('2026-09-17', '2026-09-16')).toBe(false)
  })

  it('calculates the next Bangkok calendar day across month boundaries', () => {
    expect(toBangkokEnd('2026-09-30')).toBe('2026-10-01T00:00:00+07:00')
  })
})
