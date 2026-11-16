const relative = new Intl.RelativeTimeFormat('hu', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "5 perccel ezelőtt", "tegnap": the server sends UTC, shown relative to now. */
export function ago(iso: string, now = Date.now()): string {
  const seconds = (Date.parse(iso) - now) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return relative.format(0, 'second')
}
