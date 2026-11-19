import { t } from './strings'

// A cooking's day is the household's local date, "YYYY-MM-DD": no time, no time zone.

const shortDate = new Intl.DateTimeFormat('hu', { month: 'short', day: 'numeric' })

const pad = (n: number) => String(n).padStart(2, '0')

/** A date's local day, as the API takes it. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The local midnight of a day. */
function dateOf(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

export function today(now = new Date()): string {
  return isoDay(now)
}

export function addDays(day: string, days: number): string {
  const date = dateOf(day)
  date.setDate(date.getDate() + days)
  return isoDay(date)
}

/** Days from today: 0 today, 1 tomorrow, -1 yesterday. */
export function daysAway(day: string, now = new Date()): number {
  return Math.round((dateOf(day).getTime() - dateOf(today(now)).getTime()) / 86_400_000)
}

const cap = (text: string) => text.charAt(0).toLocaleUpperCase('hu') + text.slice(1)

// Monday first, as the strings are.
const weekday = (day: string) => (dateOf(day).getDay() + 6) % 7

/** "Ma", "Holnap", "Tegnap", else the weekday ("Szombat"). */
export function dayName(day: string, now = new Date()): string {
  const away = daysAway(day, now)
  if (away === 0) return cap(t.time.today)
  if (away === 1) return cap(t.time.tomorrow)
  if (away === -1) return cap(t.time.yesterday)
  return cap(t.time.weekdays[weekday(day)])
}

/** "nov. 22." */
export function dayDate(day: string): string {
  return shortDate.format(dateOf(day))
}

/** A day's heading: "Szombat · nov. 22." */
export function dayTitle(day: string, now = new Date()): string {
  return `${dayName(day, now)} · ${dayDate(day)}`
}

/** A day chip: "Ma", "Holnap", the weekday, with its date from a week on. */
export function dayChip(day: string, now = new Date()): string {
  const away = daysAway(day, now)
  return away >= 7 ? `${dayName(day, now)} ${dayDate(day)}` : dayName(day, now)
}

/** For a day: "mára", "holnapra", "szombatra", with its date from a week off. */
export function dayFor(day: string, now = new Date()): string {
  const away = daysAway(day, now)
  if (away === 0) return t.time.todayFor
  if (away === 1) return t.time.tomorrowFor
  if (away === -1) return t.time.yesterdayFor
  const name = t.time.weekdaysFor[weekday(day)]
  return Math.abs(away) >= 7 ? `${name} (${dayDate(day)})` : name
}

/** The days a cooking can be planned for: today and the nine after. */
export function nextDays(count = 10, now = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today(now), i))
}
