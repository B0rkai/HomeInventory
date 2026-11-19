import { useEffect, useState } from 'react'
import { listActivity, type ActivityOut } from './api'
import { useHouse } from './house'
import { LevelName } from './LevelPicker'
import { verb } from './logText'
import { Named } from './Named'
import { t } from './strings'

const PAGE = 200
const stamp = new Intl.DateTimeFormat('hu', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase('hu')

/** The whole log in a table, filtered by who, what was done and a name. */
export function AdminLog() {
  const { house } = useHouse()
  const [entries, setEntries] = useState<ActivityOut[]>([])
  const [more, setMore] = useState(true)
  const [who, setWho] = useState('')
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')

  // The newest page, again whenever the house changes; older pages on request.
  useEffect(() => {
    let current = true
    listActivity({ query: { limit: PAGE } }).then(({ data }) => {
      if (!current || !data) return
      setEntries((old) => {
        const newest = new Set(data.map((e) => e.id))
        const older = old.filter((e) => !newest.has(e.id) && e.id < (data.at(-1)?.id ?? 0))
        return [...data, ...older]
      })
      setMore(data.length === PAGE)
    })
    return () => {
      current = false
    }
  }, [house])

  function older() {
    const last = entries.at(-1)
    listActivity({ query: { limit: PAGE, before_id: last?.id } }).then(({ data }) => {
      if (!data) return
      setEntries((old) => [...old, ...data])
      setMore(data.length === PAGE)
    })
  }

  if (!house) return null
  const place = (id: number | null) =>
    id === null ? '' : (house.locations.find((l) => l.id === id)?.name ?? '?')
  const names = [...new Set(entries.map((e) => e.user_name ?? ''))].filter(Boolean).sort()
  const actions = [...new Set(entries.map((e) => e.action))]
  const words = fold(search).split(/\s+/).filter(Boolean)
  const shown = entries.filter(
    (e) =>
      (!who || e.user_name === who) &&
      (!action || e.action === action) &&
      words.every((word) => fold(`${e.name} ${e.variant ?? ''}`).includes(word)),
  )
  const label = (entry: ActivityOut) => (entry.action === 'level' ? t.admin.levelSet : verb(entry))

  return (
    <>
      <div className="admin-filters">
        <input
          className="search"
          type="search"
          placeholder={t.admin.logSearch}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select aria-label={t.admin.who} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">{t.admin.everyone}</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={t.admin.action}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">{t.admin.allActions}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {label({ ...entries.find((e) => e.action === a)!, assignee_name: '…' })}
            </option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.admin.when}</th>
              <th>{t.admin.who}</th>
              <th>{t.admin.action}</th>
              <th>{t.admin.what}</th>
              <th>{t.admin.placeColumn}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr key={entry.id}>
                <td className="small muted">{stamp.format(new Date(entry.at))}</td>
                <td>{entry.user_name}</td>
                <td>{entry.level ? <LevelName level={entry.level} /> : verb(entry)}</td>
                <td>
                  <Named
                    thing={{ name: entry.name, variant: entry.variant, icon: null }}
                    kind={entry.kind === 'buy' ? 'item' : 'chore'}
                  />
                </td>
                <td className="small">
                  {entry.action === 'moved'
                    ? `${place(entry.location_id)} → ${place(entry.to_location_id)}`
                    : place(entry.location_id)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <div className="actions">
          <button type="button" className="secondary" onClick={older}>
            {t.admin.older}
          </button>
        </div>
      )}
    </>
  )
}
