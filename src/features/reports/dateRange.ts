export function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
}

export function toBangkokStart(date: string): string { return `${date}T00:00:00+07:00` }
export function toBangkokEnd(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1))
  const nextYear = nextDay.getUTCFullYear()
  const nextMonth = String(nextDay.getUTCMonth() + 1).padStart(2, '0')
  const nextDate = String(nextDay.getUTCDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDate}T00:00:00+07:00`
}
