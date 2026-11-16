import type { ItemOut, LocationOut, StockOut } from './api'
import { useHouse } from './house'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href, type MissingView } from './route'
import { t } from './strings'
import { isShort, placePath, treeOrder } from './tree'
import { byItem, groupByName, hasVariants } from './variants'

const key = (row: StockOut) => `${row.location_id}-${row.item_id}`

/**
 * What's low or out, by item (with where there's lots to fetch from) or by place. A list
 * to read, so it's dense; levels are changed on a place's page, one tap away.
 */
export function MissingPage({ view }: { view: MissingView }) {
  const { house } = useHouse()
  if (!house) return null
  const { locations, items, stock } = house
  const listed = stock.filter(isShort)

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
        <ByItem items={items} locations={locations} stock={stock} listed={listed} />
      ) : (
        <ByPlace items={items} locations={locations} listed={listed} />
      )}
    </>
  )
}

type Props = {
  items: ItemOut[]
  locations: LocationOut[]
  listed: StockOut[]
}

// Out before low.
const bySeverity = (a: StockOut, b: StockOut) =>
  a.level === b.level ? 0 : a.level === 'out' ? -1 : 1

function ByItem({ items, locations, stock, listed }: Props & { stock: StockOut[] }) {
  const order = new Map(treeOrder(locations).map((location, index) => [location.id, index]))
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const byPlace = (a: StockOut, b: StockOut) =>
    (order.get(a.location_id) ?? 0) - (order.get(b.location_id) ?? 0)
  const worst = (rows: StockOut[]) => (rows.some((row) => row.level === 'out') ? 0 : 1)
  // One card per item name: variants ("Konzerv" kukorica, vörösbab) share it.
  const groups = groupByName(
    listed.filter((row) => itemsById.has(row.item_id)),
    (row) => itemsById.get(row.item_id)!,
  ).sort((a, b) => worst(a.rows) - worst(b.rows))

  return groups.map((group) => {
    const rows = group.rows.sort(
      (a, b) =>
        byItem(itemsById.get(a.item_id)!, itemsById.get(b.item_id)!) ||
        bySeverity(a, b) ||
        byPlace(a, b),
    )
    const variants = hasVariants(group, (row) => itemsById.get(row.item_id)!)
    // Where there's lots of the very variants that are short.
    const shortIds = new Set(rows.map((row) => row.item_id))
    const lots = stock
      .filter((row) => shortIds.has(row.item_id) && row.level === 'lots')
      .sort(byPlace)
    return (
      <section key={group.name} className="card">
        <h3 className="item-title">
          <Named thing={{ name: group.name, icon: group.first.icon }} kind="item" />
        </h3>
        <ul className="missing-rows">
          {rows.map((row) => {
            const item = itemsById.get(row.item_id)!
            return (
              <li key={key(row)}>
                <span>
                  {variants && (
                    <span className="variant-label">{item.variant ?? t.items.noVariant} · </span>
                  )}
                  <a href={href.place(row.location_id)}>{placePath(locations, row.location_id)}</a>
                </span>
                <LevelName level={row.level} />
              </li>
            )
          })}
        </ul>
        {lots.length > 0 && (
          <p className="lots-hint">
            {t.missing.lotsAt}{' '}
            {lots.map((row, index) => {
              const variant = variants && itemsById.get(row.item_id)!.variant
              return (
                <span key={key(row)}>
                  {index > 0 && ', '}
                  <a href={href.place(row.location_id)}>{placePath(locations, row.location_id)}</a>
                  {variant && ` (${variant})`}
                </span>
              )
            })}
          </p>
        )}
      </section>
    )
  })
}

function ByPlace({ items, locations, listed }: Props) {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  return treeOrder(locations).map((location) => {
    const rows = listed
      .filter((row) => row.location_id === location.id && itemsById.has(row.item_id))
      .map((row) => ({ row, item: itemsById.get(row.item_id)! }))
      .sort((a, b) => bySeverity(a.row, b.row) || byItem(a.item, b.item))
    if (!rows.length) return null
    return (
      <section key={location.id} className="card">
        <h3>
          <a href={href.place(location.id)}>{placePath(locations, location.id)}</a>
        </h3>
        <ul className="missing-rows">
          {rows.map(({ row, item }) => (
            <li key={key(row)}>
              <Named thing={item} kind="item" />
              <LevelName level={row.level} />
            </li>
          ))}
        </ul>
      </section>
    )
  })
}
