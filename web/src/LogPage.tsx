import { useEffect, useState } from 'react'
import { listActivity, type ActivityOut } from './api'
import { useHouse } from './house'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { t } from './strings'

const PAGE = 50
// The server's limit.
const MOST = 500
// One person doing the same thing to the same item within this is one row (an item
// bought for two places).
const SAME_ROW_MS = 10 * 60_000

const clock = new Intl.DateTimeFormat('hu', { hour: '2-digit', minute: '2-digit' })
const longDate = new Intl.DateTimeFormat('hu', { month: 'long', day: 'numeric', weekday: 'long' })

type Row = { first: ActivityOut; places: (number | null)[] }

/** Entries merged into rows, newest first, and the rows by day. */
function byDay(entries: ActivityOut[]): [string, Row[]][] {
  const days = new Map<string, Row[]>()
  let last: Row | undefined
  for (const entry of entries) {
    const at = new Date(entry.at)
    const same =
      last &&
      last.first.user_name === entry.user_name &&
      last.first.action === entry.action &&
      last.first.name === entry.name &&
      last.first.variant === entry.variant &&
      last.first.level === entry.level &&
      last.first.to_location_id === entry.to_location_id &&
      new Date(last.first.at).getTime() - at.getTime() < SAME_ROW_MS
    if (same && last) {
      if (!last.places.includes(entry.location_id)) last.places.push(entry.location_id)
      continue
    }
    last = { first: entry, places: [entry.location_id] }
    const day = dayName(at)
    days.set(day, [...(days.get(day) ?? []), last])
  }
  return [...days]
}

function dayName(at: Date, now = new Date()): string {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((midnight(now) - midnight(at)) / 86_400_000)
  if (days === 0) return t.time.today
  if (days === 1) return t.time.yesterday
  return longDate.format(at)
}

function verb(entry: ActivityOut): string {
  switch (entry.action) {
    case 'done':
      return entry.kind === 'buy' ? t.log.bought : t.log.choreDone
    case 'level':
      return ''
    default:
      return t.log[entry.action]
  }
}

/** Who did what, newest first; refreshed whenever the house changes. */
export function LogPage() {
  const { house } = useHouse()
  const [entries, setEntries] = useState<ActivityOut[]>()
  const [failed, setFailed] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    let current = true
    listActivity({ query: { limit } }).then(
      ({ data }) => {
        if (!current) return
        setFailed(!data)
        if (data) setEntries(data)
      },
      () => current && setFailed(true),
    )
    return () => {
      current = false
    }
  }, [limit, house])

  if (!house) return null
  const { items, chores, locations } = house
  // The place's own name, as in the notifications: the full path is too long here.
  const place = (id: number | null) =>
    id === null ? t.log.wholeHouse : (locations.find((l) => l.id === id)?.name ?? null)

  return (
    <>
      <h2>{t.log.title}</h2>
      {failed && !entries && (
        <div className="card" role="alert">
          <p>{t.log.failed}</p>
        </div>
      )}
      {entries?.length === 0 && (
        <div className="card">
          <p>{t.log.empty}</p>
        </div>
      )}
      {entries &&
        byDay(entries).map(([day, rows]) => (
          <section key={day} className="card">
            <h3>{day}</h3>
            <ul className="log">
              {rows.map(({ first, places }) => {
                const item = items.find((i) => i.id === first.item_id)
                const chore = chores.find((c) => c.id === first.chore_id)
                // As it is now if it's still there, else as it was.
                const thing = item ??
                  chore ?? { name: first.name, variant: first.variant, icon: null }
                const name = <Named thing={thing} kind={first.kind === 'buy' ? 'item' : 'chore'} />
                // Something written on the shopping list has no place.
                const where =
                  first.kind === 'buy' && first.location_id === null
                    ? []
                    : first.action === 'moved'
                      ? [
                          `${place(first.location_id) ?? '?'} → ${place(first.to_location_id) ?? '?'}`,
                        ]
                      : places.map(place).filter((p) => p !== null)
                return (
                  <li key={first.id}>
                    {item ? (
                      <a className="item-link" href={href.item(item.id)}>
                        {name}
                      </a>
                    ) : (
                      name
                    )}
                    <p className="small muted">
                      <span className="log-who">{first.user_name}</span>
                      {first.level ? (
                        <>
                          {': '}
                          <LevelName level={first.level} />
                        </>
                      ) : (
                        ` ${verb(first)}`
                      )}
                      {where.length > 0 && ` · ${where.join(', ')}`} ·{' '}
                      {clock.format(new Date(first.at))}
                    </p>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      {entries && entries.length === limit && limit < MOST && (
        <div className="actions">
          <button type="button" className="secondary" onClick={() => setLimit(limit + PAGE)}>
            {t.log.more}
          </button>
        </div>
      )}
    </>
  )
}
