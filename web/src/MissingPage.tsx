import { useState } from 'react'
import type { ItemOut, LocationOut, StockOut } from './api'
import { useHouse } from './house'
import { LevelName, LevelPicker } from './LevelPicker'
import { Named } from './Named'
import { href, type MissingView } from './route'
import { t } from './strings'
import { byName, isShort, pathTo, treeOrder } from './tree'

const key = (row: StockOut) => `${row.location_id}-${row.item_id}`

/** What's low or out: by item (with where there's lots to fetch from), or by place. */
export function MissingPage({ view }: { view: MissingView }) {
  const { house, actions } = useHouse()
  // Rows changed here stay listed until the page is left, so they don't jump away mid-tap.
  const [touched, setTouched] = useState(() => new Set<string>())
  if (!house) return null
  const { locations, items, stock } = house

  const listed = stock.filter((row) => isShort(row) || touched.has(key(row)))
  const setLevel = (row: StockOut, level: StockOut['level']) => {
    setTouched((keys) => new Set(keys).add(key(row)))
    void actions.setLevel(row.location_id, row.item_id, level)
  }

  return (
    <>
      <h2>{t.missing.title}</h2>
      <div className="tabs" role="tablist">
        {(['items', 'places'] as const).map((tab) => (
          <a
            key={tab}
            role="tab"
            aria-selected={view === tab}
            href={href.missing(tab)}
            onClick={(event) => {
              // Switching views shouldn't add to the back button's history.
              event.preventDefault()
              window.location.replace(href.missing(tab))
            }}
          >
            {tab === 'items' ? t.missing.byItem : t.missing.byPlace}
          </a>
        ))}
      </div>
      {listed.length === 0 && (
        <div className="card">
          <p>{t.missing.none}</p>
        </div>
      )}
      {view === 'items' ? (
        <ByItem
          items={items}
          locations={locations}
          stock={stock}
          listed={listed}
          onLevel={setLevel}
        />
      ) : (
        <ByPlace items={items} locations={locations} listed={listed} onLevel={setLevel} />
      )}
    </>
  )
}

type Props = {
  items: ItemOut[]
  locations: LocationOut[]
  listed: StockOut[]
  onLevel: (row: StockOut, level: StockOut['level']) => void
}

function placePath(locations: LocationOut[], id: number): string {
  return pathTo(locations, id)
    .map((location) => location.name)
    .join(' › ')
}

function ByItem({ items, locations, stock, listed, onLevel }: Props & { stock: StockOut[] }) {
  const order = new Map(treeOrder(locations).map((location, index) => [location.id, index]))
  const byPlace = (a: StockOut, b: StockOut) =>
    (order.get(a.location_id) ?? 0) - (order.get(b.location_id) ?? 0)
  const worst = (rows: StockOut[]) => (rows.some((row) => row.level === 'out') ? 0 : 1)
  const groups = items
    .map((item) => ({ item, rows: listed.filter((row) => row.item_id === item.id).sort(byPlace) }))
    .filter((group) => group.rows.length)
    .sort((a, b) => worst(a.rows) - worst(b.rows) || byName(a.item, b.item))

  return groups.map(({ item, rows }) => {
    const lots = stock.filter((row) => row.item_id === item.id && row.level === 'lots')
    return (
      <section key={item.id} className="card">
        <h3 className="item-title">
          <Named thing={item} kind="item" />
        </h3>
        <ul className="stock">
          {rows.map((row) => (
            <li key={key(row)}>
              <div className="stock-name">
                <a href={href.place(row.location_id)}>{placePath(locations, row.location_id)}</a>
                <LevelName level={row.level} />
              </div>
              <LevelPicker
                level={row.level}
                label={`${item.name}: ${placePath(locations, row.location_id)}`}
                onChange={(level) => onLevel(row, level)}
              />
            </li>
          ))}
        </ul>
        {lots.length > 0 && (
          <p className="lots-hint">
            {t.missing.lotsAt}{' '}
            {lots.sort(byPlace).map((row, index) => (
              <span key={row.location_id}>
                {index > 0 && ', '}
                <a href={href.place(row.location_id)}>{placePath(locations, row.location_id)}</a>
              </span>
            ))}
          </p>
        )}
      </section>
    )
  })
}

function ByPlace({ items, locations, listed, onLevel }: Props) {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  return treeOrder(locations).map((location) => {
    const rows = listed
      .filter((row) => row.location_id === location.id && itemsById.has(row.item_id))
      .map((row) => ({ row, item: itemsById.get(row.item_id)! }))
      .sort((a, b) => byName(a.item, b.item))
    if (!rows.length) return null
    return (
      <section key={location.id} className="card">
        <h3>
          <a href={href.place(location.id)}>{placePath(locations, location.id)}</a>
        </h3>
        <ul className="stock">
          {rows.map(({ row, item }) => (
            <li key={key(row)}>
              <div className="stock-name">
                <Named thing={item} kind="item" />
                <LevelName level={row.level} />
              </div>
              <LevelPicker
                level={row.level}
                label={item.name}
                onChange={(level) => onLevel(row, level)}
              />
            </li>
          ))}
        </ul>
      </section>
    )
  })
}
