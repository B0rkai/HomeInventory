import { t } from './strings'

const date = new Intl.DateTimeFormat('hu', { month: 'short', day: 'numeric' })

/** Whole calendar days between two times, in the phone's time zone. */
function daysBetween(then: Date, now: Date): number {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((midnight(now) - midnight(then)) / 86_400_000)
}

/** "most", "5 perce", "2 órája", "tegnap", "3 napja", then a date: short, for list rows. */
export function ago(iso: string, now = new Date()): string {
  const then = new Date(iso) // the server sends UTC; Date shows it in local time
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return t.time.now
  if (minutes < 60) return t.time.minutes(minutes)
  const days = daysBetween(then, now)
  if (days === 0) return t.time.hours(Math.floor(minutes / 60))
  if (days === 1) return t.time.yesterday
  if (days < 7) return t.time.days(days)
  return date.format(then)
}
