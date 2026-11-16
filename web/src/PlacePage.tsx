import { useState } from 'react'
import { useHouse } from './house'
import { IconPicker } from './IconPicker'
import { COMMON_ITEMS, guessIcon, iconOf } from './icons'
import { LevelName, LevelPicker } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { ShortageBadge } from './ShortageBadge'
import { t } from './strings'
import { ago } from './time'
import { AddForm } from './AddForm'
import { MAX_DEPTH, byName, childrenOf, pathTo, shortageIn } from './tree'

/** One place: the places inside it, and the level of everything kept here. */
export function PlacePage({ id }: { id: number }) {
  const { house, actions } = useHouse()
  const [editing, setEditing] = useState(false)
  if (!house) return null
  const { locations, items, stock } = house

  const path = pathTo(locations, id)
  const place = path.at(-1)
  if (!place) {
    return (
      <div className="card">
        <p>{t.place.notFound}</p>
        <a className="link" href={href.home}>
          {t.back}
        </a>
      </div>
    )
  }

  const depth = path.length
  const parent = path.at(-2)
  const children = childrenOf(locations, id)
  const siblings = childrenOf(locations, place.parent_id)
  const index = siblings.findIndex((sibling) => sibling.id === id)
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const rows = stock
    .filter((row) => row.location_id === id && itemsById.has(row.item_id))
    .map((row) => ({ ...row, item: itemsById.get(row.item_id)! }))
    .sort((a, b) => byName(a.item, b.item))
  const keptHere = new Set(rows.map((row) => row.item_id))
  // Items not kept here yet, then common supplies not in the catalogue yet.
  const known = new Set(items.map((item) => item.name.toLocaleLowerCase('hu')))
  const suggestions = [
    ...items
      .filter((item) => !keptHere.has(item.id))
      .sort(byName)
      .map((item) => ({ value: item.name, label: iconOf(item, 'item') })),
    ...COMMON_ITEMS.filter((name) => !known.has(name.toLocaleLowerCase('hu'))).map((name) => ({
      value: name,
      label: guessIcon(name, 'item'),
    })),
  ]

  async function addItem(name: string) {
    const folded = name.toLocaleLowerCase('hu')
    const item =
      items.find((i) => i.name.toLocaleLowerCase('hu') === folded) ?? (await actions.addItem(name))
    return Boolean(item && (await actions.setLevel(id, item.id, 'plenty')))
  }

  async function remove() {
    if (!place || !window.confirm(t.place.confirmDelete(place.name))) return
    if (await actions.deleteLocation(id)) {
      window.location.replace(parent ? href.place(parent.id) : href.home)
    }
  }

  return (
    <>
      <nav className="crumbs">
        <a href={parent ? href.place(parent.id) : href.home} aria-label={t.back}>
          ←
        </a>
        {path.slice(0, -1).map((ancestor) => (
          <a key={ancestor.id} href={href.place(ancestor.id)}>
            {ancestor.name}
          </a>
        ))}
      </nav>
      <div className="title-row">
        <h2>
          <Named thing={place} kind="place" />
        </h2>
        <button type="button" className="secondary" onClick={() => setEditing(!editing)}>
          {editing ? t.done : t.edit}
        </button>
      </div>

      {editing && (
        <div className="card edit-panel">
          <AddForm
            key={place.name}
            label={t.place.rename}
            initial={place.name}
            onSubmit={async (name) => Boolean(await actions.updateLocation(id, { name }))}
          />
          <IconPicker
            kind="place"
            name={place.name}
            value={place.icon}
            onChange={(icon) => actions.updateLocation(id, { icon })}
          />
          {siblings.length > 1 && (
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={index === 0}
                onClick={() => actions.updateLocation(id, { position: index - 1 })}
              >
                ↑ {t.place.moveUp}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={index === siblings.length - 1}
                onClick={() => actions.updateLocation(id, { position: index + 1 })}
              >
                ↓ {t.place.moveDown}
              </button>
            </div>
          )}
          {depth < MAX_DEPTH && (
            <AddForm
              label={t.place.addChild[depth - 1]}
              onSubmit={async (name) => Boolean(await actions.addLocation(name, id))}
            />
          )}
          {children.length ? (
            <p className="muted">{t.place.deleteHasChildren}</p>
          ) : (
            <div className="actions">
              <button type="button" className="danger" onClick={remove}>
                {t.place.delete}
              </button>
            </div>
          )}
        </div>
      )}

      {children.length > 0 && (
        <section className="card">
          <h3>{t.place.childrenTitle[depth - 1]}</h3>
          <div className="chips">
            {children.map((child) => (
              <a key={child.id} className="chip" href={href.place(child.id)}>
                <Named thing={child} kind="place" />
                <ShortageBadge shortage={shortageIn(locations, stock, child.id)} />
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h3>{t.place.stockTitle}</h3>
        {rows.length === 0 && <p className="muted">{t.place.noStock}</p>}
        <ul className="stock">
          {rows.map((row) => (
            <li key={row.item_id}>
              <div className="stock-name">
                <Named thing={row.item} kind="item" />
                {editing ? (
                  <button
                    type="button"
                    className="icon"
                    aria-label={t.place.removeItem(row.item.name)}
                    onClick={() => actions.removeStock(id, row.item_id)}
                  >
                    ×
                  </button>
                ) : (
                  <span className="small">
                    <LevelName level={row.level} />
                    <span className="muted">
                      {t.place.updated(row.updated_by_name, ago(row.updated_at))}
                    </span>
                  </span>
                )}
              </div>
              <LevelPicker
                level={row.level}
                label={row.item.name}
                onChange={(level) => actions.setLevel(id, row.item_id, level)}
              />
            </li>
          ))}
        </ul>
        <AddForm
          label={t.place.addItem}
          placeholder={t.place.addItemPlaceholder}
          suggestions={suggestions}
          onSubmit={addItem}
        />
      </section>
    </>
  )
}
