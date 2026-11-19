import { type FormEvent, useState } from 'react'
import { categoryName, categoryOf } from './categories'
import { claimText } from './claims'
import { useHouse } from './house'
import { ItemForm } from './ItemForm'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { t } from './strings'
import { bestLevel, placePath, treeOrder } from './tree'
import { byItem, fullName } from './variants'

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
  const substitutes = items.filter((other) => item.substitute_ids.includes(other.id))
  const links = (list: typeof items) =>
    list.map((other, index) => (
      <span key={other.id}>
        {index > 0 && ', '}
        <a className="link" href={href.item(other.id)}>
          {fullName(other)}
        </a>
      </span>
    ))

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
        {item.any_variant && ` · ${t.items.anyVariantNote}`}
        {item.family && ` · ${t.items.familyNote(item.family)}`}
        {level && (
          <>
            {' · '}
            {t.item.best} <LevelName level={level} />
          </>
        )}
      </p>
      {substitutes.length > 0 && (
        <p className="small item-meta">
          <span className="muted">{t.items.substitutes}: </span>
          {links(substitutes)}
        </p>
      )}

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
        {rows.length > 0 && <MoveForm itemId={id} from={rows.map((row) => row.location_id)} />}
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

/** Moves the item to another place, as when it gets put away elsewhere. Folded into a
 * button until needed. */
function MoveForm({ itemId, from }: { itemId: number; from: number[] }) {
  const { house, actions } = useHouse()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  if (!house) return null
  const ordered = treeOrder(house.locations)
  const sourceId = from.length === 1 ? from[0] : Number(source) || undefined
  if (!open) {
    return (
      <div className="actions one-off-toggle">
        <button type="button" className="secondary small-button" onClick={() => setOpen(true)}>
          {t.item.move}
        </button>
      </div>
    )
  }

  async function move(event: FormEvent) {
    event.preventDefault()
    if (!sourceId || !target) return
    setSaving(true)
    const moved = await actions.moveStock([itemId], sourceId, Number(target))
    setSaving(false)
    if (moved) {
      setOpen(false)
      setSource('')
      setTarget('')
    }
  }

  return (
    <form className="add-form move-form" onSubmit={move}>
      <p className="small muted">{t.item.moveHint}</p>
      {from.length > 1 && (
        <select
          aria-label={t.item.moveFrom}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          required
        >
          <option value="">
            {t.item.moveFrom}: {t.item.movePick}
          </option>
          {ordered
            .filter((location) => from.includes(location.id))
            .map((location) => (
              <option key={location.id} value={location.id}>
                {placePath(house.locations, location.id)}
              </option>
            ))}
        </select>
      )}
      <div className="row">
        <select
          aria-label={t.item.moveTo}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          required
        >
          <option value="">
            {t.item.moveTo}: {t.item.movePick}
          </option>
          {ordered
            .filter((location) => location.id !== sourceId)
            .map((location) => (
              <option key={location.id} value={location.id}>
                {placePath(house.locations, location.id)}
              </option>
            ))}
        </select>
        <button type="submit" disabled={saving || !sourceId || !target}>
          {t.item.moveButton}
        </button>
      </div>
      <button type="button" className="secondary" onClick={() => setOpen(false)}>
        {t.cancel}
      </button>
    </form>
  )
}
