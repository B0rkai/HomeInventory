import { useState } from 'react'
import { categoryName, categoryOf } from './categories'
import { claimText } from './claims'
import { useHouse } from './house'
import { ItemForm } from './ItemForm'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { t } from './strings'
import { bestLevel, placePath, treeOrder } from './tree'
import { byItem } from './variants'

/** One item: where it's kept and how much there is, its other variants, and editing it. */
export function ItemPage({ id }: { id: number }) {
  const { me, house, actions } = useHouse()
  const [editing, setEditing] = useState(false)
  if (!house) return null
  const { locations, items, stock, requests } = house
  const item = items.find((i) => i.id === id)
  if (!item) {
    return (
      <div className="card">
        <p>{t.item.notFound}</p>
        <a className="link" href={href.items}>
          {t.back}
        </a>
      </div>
    )
  }

  const order = new Map(treeOrder(locations).map((location, index) => [location.id, index]))
  const rows = stock
    .filter((row) => row.item_id === id)
    .sort((a, b) => (order.get(a.location_id) ?? 0) - (order.get(b.location_id) ?? 0))
  const variants = items
    .filter((i) => i.name.toLocaleLowerCase('hu') === item.name.toLocaleLowerCase('hu'))
    .sort(byItem)
  const level = bestLevel(rows)

  return (
    <>
      <nav className="crumbs">
        {/* Back to wherever it was opened from: the catalogue or a place. */}
        <a
          href={href.items}
          aria-label={t.back}
          onClick={(event) => {
            event.preventDefault()
            history.back()
          }}
        >
          ←
        </a>
        <a href={href.items}>{t.items.title}</a>
      </nav>
      <div className="title-row">
        <h2>
          <Named thing={item} kind="item" />
        </h2>
        {!editing && (
          <button type="button" className="secondary" onClick={() => setEditing(true)}>
            {t.edit}
          </button>
        )}
      </div>
      <p className="small muted item-meta">
        {categoryName(categoryOf(item))}
        {!item.restock && ` · ${t.items.noRestock}`}
        {level && (
          <>
            {' · '}
            {t.item.best} <LevelName level={level} />
          </>
        )}
      </p>

      {editing && (
        <div className="card">
          <ItemForm
            item={item}
            onDone={() => setEditing(false)}
            onDeleted={() => window.location.replace(href.items)}
          />
        </div>
      )}

      <section className="card">
        <h3>{t.item.where}</h3>
        {rows.length === 0 && <p className="muted">{t.item.nowhere}</p>}
        <ul className="missing-rows">
          {rows.map((row) => {
            const request = requests.find(
              (r) => r.item_id === id && r.location_id === row.location_id,
            )
            const note = claimText(request, me) ?? (request && t.place.listed)
            return (
              <li key={row.location_id}>
                <a href={href.place(row.location_id)}>{placePath(locations, row.location_id)}</a>
                <span className="where-level">
                  <LevelName level={row.level} />
                  {note && <span className="claim small">{note}</span>}
                  {/* By hand, whatever the level: more is needed (a party), say. */}
                  {!request && (
                    <button
                      type="button"
                      className="secondary small-button list-button"
                      onClick={() => actions.requestStock(row.location_id, id)}
                    >
                      + {t.place.toList}
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {variants.length > 1 && (
        <section className="card">
          <h3>{t.items.variant}</h3>
          <div className="chips">
            {variants.map((v) => (
              <a
                key={v.id}
                className="chip"
                href={href.item(v.id)}
                aria-current={v.id === id ? 'page' : undefined}
                onClick={(event) => {
                  // Switching variants shouldn't add to the back button's history.
                  event.preventDefault()
                  window.location.replace(href.item(v.id))
                }}
              >
                {v.variant ?? t.items.noVariant}
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
