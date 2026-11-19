import { type KeyboardEvent, useState } from 'react'
import type { Category, ItemOut, StockOut } from './api'
import { AdminAddItem } from './AdminAddItem'
import { CATEGORIES, categoryName, categoryOf, iconCategory } from './categories'
import { claimText } from './claims'
import { useHouse } from './house'
import { iconOf } from './iconLookup'
import { ItemForm } from './ItemForm'
import { LevelName, LevelPicker } from './LevelPicker'
import { IconTile } from './Named'
import { t } from './strings'
import { bestLevel, placePath, treeOrder } from './tree'
import { byItem, fullName } from './variants'

type SortKey = 'name' | 'group' | 'level'
const FULLNESS = { lots: 3, plenty: 2, low: 1, out: 0 }
// Filters: a group, or items with none; a place, or items kept nowhere.
const NO_GROUP = 'none'
const NOWHERE = 'nowhere'

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase('hu')

/** Every item in a table: edited in place, several changed or moved at once. */
export function AdminItems() {
  const { house, actions } = useHouse()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const [place, setPlace] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: 'name', down: false })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<number>()
  if (!house) return null
  const { items, stock, locations } = house
  const order = new Map(treeOrder(locations).map((location, index) => [location.id, index]))
  const rowsOf = (id: number) =>
    stock
      .filter((row) => row.item_id === id)
      .sort((a, b) => (order.get(a.location_id) ?? 0) - (order.get(b.location_id) ?? 0))
  const variantCount = (item: ItemOut) =>
    items.filter((i) => fold(i.name) === fold(item.name)).length

  const words = fold(search).split(/\s+/).filter(Boolean)
  const shown = items
    .filter((item) => {
      const text = fold(`${item.name} ${item.variant ?? ''}`)
      if (!words.every((word) => text.includes(word))) return false
      if (group && (categoryOf(item) ?? NO_GROUP) !== group) return false
      const rows = rowsOf(item.id)
      if (place === NOWHERE) return rows.length === 0
      return !place || rows.some((row) => row.location_id === Number(place))
    })
    .sort((a, b) => {
      let by = 0
      if (sort.key === 'group') {
        const rank = (item: ItemOut) => {
          const category = categoryOf(item)
          return category ? CATEGORIES.indexOf(category) : CATEGORIES.length
        }
        by = rank(a) - rank(b)
      } else if (sort.key === 'level') {
        const fullness = (item: ItemOut) => {
          const level = bestLevel(rowsOf(item.id))
          return level ? FULLNESS[level] : -1
        }
        by = fullness(a) - fullness(b)
      }
      return (sort.down ? -by : by) || byItem(a, b)
    })
  const picked = items.filter((item) => selected.has(item.id))
  const allShown = shown.length > 0 && shown.every((item) => selected.has(item.id))

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const sortBy = (key: SortKey) =>
    setSort({ key, down: sort.key === key ? !sort.down : key === 'level' })
  const header = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.down ? 'descending' : 'ascending') : undefined}>
      <button type="button" className="sort-button" onClick={() => sortBy(key)}>
        {label} {sort.key === key ? (sort.down ? '↓' : '↑') : ''}
      </button>
    </th>
  )

  return (
    <>
      <AdminAddItem />
      <div className="admin-filters">
        <input
          className="search"
          type="search"
          placeholder={t.admin.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label={t.admin.group}
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        >
          <option value="">{t.admin.allGroups}</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {categoryName(category)}
            </option>
          ))}
          <option value={NO_GROUP}>{categoryName(null)}</option>
        </select>
        <select
          aria-label={t.admin.where}
          value={place}
          onChange={(event) => setPlace(event.target.value)}
        >
          <option value="">{t.admin.allPlaces}</option>
          {treeOrder(locations).map((location) => (
            <option key={location.id} value={location.id}>
              {placePath(locations, location.id)}
            </option>
          ))}
          <option value={NOWHERE}>{t.admin.nowhere}</option>
        </select>
        <span className="small muted">{t.admin.count(shown.length, items.length)}</span>
      </div>

      {picked.length > 0 && <BulkBar picked={picked} onClear={() => setSelected(new Set())} />}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th className="check-cell">
                <input
                  type="checkbox"
                  aria-label={t.admin.selectAll}
                  checked={allShown}
                  onChange={() => {
                    const next = new Set(selected)
                    for (const item of shown) {
                      if (allShown) next.delete(item.id)
                      else next.add(item.id)
                    }
                    setSelected(next)
                  }}
                />
              </th>
              {header('name', t.admin.name)}
              <th>{t.admin.variant}</th>
              {header('group', t.admin.group)}
              <th>{t.admin.restock}</th>
              <th>{t.admin.anyVariant}</th>
              {header('level', t.admin.where)}
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                rows={rowsOf(item.id)}
                hasVariants={variantCount(item) > 1}
                selected={selected.has(item.id)}
                onSelect={() => toggle(item.id)}
                editing={editing === item.id}
                onEdit={() => setEditing(editing === item.id ? undefined : item.id)}
                onSave={(body) => void actions.updateItem(item.id, body)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="muted">{t.items.noMatch}</p>}
    </>
  )
}

function ItemRow({
  item,
  rows,
  hasVariants,
  selected,
  onSelect,
  editing,
  onEdit,
  onSave,
}: {
  item: ItemOut
  rows: StockOut[]
  hasVariants: boolean
  selected: boolean
  onSelect: () => void
  editing: boolean
  onEdit: () => void
  onSave: (body: Parameters<ReturnType<typeof useHouse>['actions']['updateItem']>[1]) => void
}) {
  const { house } = useHouse()
  const locations = house?.locations ?? []
  return (
    <>
      <tr className={selected ? 'selected' : undefined}>
        <td className="check-cell">
          <input type="checkbox" aria-label={item.name} checked={selected} onChange={onSelect} />
        </td>
        <td>
          <div className="name-cell">
            <IconTile
              icon={iconOf(item, 'item')}
              name={item.name}
              kind="item"
              hue={item.category ?? undefined}
            />
            <TextCell
              key={item.name}
              value={item.name}
              label={t.admin.name}
              required
              onSave={(name) => onSave({ name })}
            />
          </div>
        </td>
        <td>
          <TextCell
            key={item.variant ?? ''}
            value={item.variant ?? ''}
            label={t.admin.variant}
            onSave={(variant) => onSave({ variant })}
          />
        </td>
        <td>
          <select
            aria-label={t.admin.group}
            value={item.category ?? ''}
            onChange={(event) =>
              onSave({ category: (event.target.value || null) as Category | null })
            }
          >
            <option value="">{t.items.categoryAuto(categoryName(iconCategory(item)))}</option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categoryName(category)}
              </option>
            ))}
          </select>
        </td>
        <td className="check-cell">
          <input
            type="checkbox"
            aria-label={t.admin.restock}
            checked={item.restock}
            onChange={(event) => onSave({ restock: event.target.checked })}
          />
        </td>
        <td className="check-cell">
          {hasVariants ? (
            <input
              type="checkbox"
              aria-label={t.admin.anyVariant}
              checked={item.any_variant}
              onChange={(event) => onSave({ any_variant: event.target.checked })}
            />
          ) : (
            <span className="muted">–</span>
          )}
        </td>
        <td className="where-cell">
          {rows.length === 0 && <span className="muted small">{t.admin.nowhere}</span>}
          {rows.map((row) => (
            <span
              key={row.location_id}
              className="where-chip small"
              title={placePath(locations, row.location_id)}
            >
              {locations.find((l) => l.id === row.location_id)?.name}{' '}
              <LevelName level={row.level} />
            </span>
          ))}
        </td>
        <td className="edit-cell">
          <button type="button" className="secondary small-button" onClick={onEdit}>
            {editing ? t.admin.close : t.admin.edit}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="edit-row">
          <td />
          <td colSpan={7}>
            <ItemForm item={item} onDone={onEdit} onDeleted={onEdit} />
            <StockEditor item={item} rows={rows} />
          </td>
        </tr>
      )}
    </>
  )
}

/** Where an item is kept: its level at each place, listed by hand, dropped from one, kept
 * at another too; as on the phone's place pages. */
function StockEditor({ item, rows }: { item: ItemOut; rows: StockOut[] }) {
  const { me, house, actions } = useHouse()
  if (!house) return null
  const { locations, requests } = house
  const kept = new Set(rows.map((row) => row.location_id))
  return (
    <div className="stock-editor">
      <h4>{t.admin.stock}</h4>
      {rows.length > 0 && (
        <table className="admin-table">
          <tbody>
            {rows.map((row) => {
              const request = requests.find(
                (r) => r.item_id === item.id && r.location_id === row.location_id,
              )
              const note = claimText(request, me) ?? (request && t.place.listed)
              return (
                <tr key={row.location_id}>
                  <td>{placePath(locations, row.location_id)}</td>
                  <td>
                    <LevelPicker
                      level={row.level}
                      label={fullName(item)}
                      onChange={(level) => actions.setLevel(row.location_id, item.id, level)}
                    />
                  </td>
                  <td className="small">
                    {note ? (
                      <span className="muted">{note}</span>
                    ) : (
                      <button
                        type="button"
                        className="secondary small-button"
                        onClick={() => actions.requestStock(row.location_id, item.id)}
                      >
                        + {t.place.toList}
                      </button>
                    )}
                  </td>
                  <td className="edit-cell">
                    <button
                      type="button"
                      className="danger small-button"
                      onClick={() => actions.removeStock(row.location_id, item.id)}
                    >
                      {t.admin.removeStock}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <select
        aria-label={t.admin.keepAlsoAt}
        value=""
        onChange={(event) => void actions.addStock(Number(event.target.value), item.id, 'plenty')}
      >
        <option value="" disabled>
          {t.admin.keepAlsoAt}
        </option>
        {treeOrder(locations)
          .filter((location) => !kept.has(location.id))
          .map((location) => (
            <option key={location.id} value={location.id}>
              {placePath(locations, location.id)}
            </option>
          ))}
      </select>
    </div>
  )
}

/** A table cell's text, saved when left (Enter too); Escape puts it back. */
export function TextCell({
  value,
  label,
  required = false,
  onSave,
}: {
  value: string
  label: string
  // A name can't be blank: emptied, it goes back.
  required?: boolean
  onSave: (value: string) => void
}) {
  const [text, setText] = useState(value)
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setText(value)
      // Left with the old text: nothing to save.
      requestAnimationFrame(() => (event.target as HTMLInputElement).blur())
    }
  }
  return (
    <input
      className="cell-input"
      aria-label={label}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={keys}
      onBlur={() => {
        const trimmed = text.trim()
        if (trimmed === value) return
        if (!trimmed && required) setText(value)
        else onSave(trimmed)
      }}
    />
  )
}

/** What can be done to the selected items at once: their group, restocking, moving. */
function BulkBar({ picked, onClear }: { picked: ItemOut[]; onClear: () => void }) {
  const { house, actions } = useHouse()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  if (!house) return null
  const { locations, stock } = house
  const ids = picked.map((item) => item.id)
  const keptAt = (locationId: number) =>
    ids.filter((id) => stock.some((row) => row.item_id === id && row.location_id === locationId))
  const ordered = treeOrder(locations)
  const sources = ordered.filter((location) => keptAt(location.id).length > 0)
  const moving = from ? keptAt(Number(from)) : []

  async function run(work: () => Promise<boolean>) {
    setBusy(true)
    await work()
    setBusy(false)
  }

  return (
    <div className="bulk-bar card">
      <strong>{t.admin.selected(picked.length)}</strong>
      <select
        aria-label={t.admin.setGroup}
        value=""
        disabled={busy}
        onChange={(event) => {
          const category = (
            event.target.value === NO_GROUP ? null : event.target.value
          ) as Category | null
          void run(() => actions.updateItems(ids, { category }))
        }}
      >
        <option value="" disabled>
          {t.admin.setGroup}
        </option>
        {CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {categoryName(category)}
          </option>
        ))}
        <option value={NO_GROUP}>{t.admin.groupAuto}</option>
      </select>
      <button
        type="button"
        className="secondary small-button"
        disabled={busy}
        onClick={() => void run(() => actions.updateItems(ids, { restock: true }))}
      >
        {t.admin.restockOn}
      </button>
      <button
        type="button"
        className="secondary small-button"
        disabled={busy}
        onClick={() => void run(() => actions.updateItems(ids, { restock: false }))}
      >
        {t.admin.restockOff}
      </button>
      <span className="bulk-move">
        <select
          aria-label={t.admin.moveFrom}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        >
          <option value="">{t.admin.moveFrom}</option>
          {sources.map((location) => (
            <option key={location.id} value={location.id}>
              {placePath(locations, location.id)}
            </option>
          ))}
        </select>
        <select
          aria-label={t.admin.moveTo}
          value={to}
          onChange={(event) => setTo(event.target.value)}
        >
          <option value="">{t.admin.moveTo}</option>
          {ordered
            .filter((location) => String(location.id) !== from)
            .map((location) => (
              <option key={location.id} value={location.id}>
                {placePath(locations, location.id)}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="small-button"
          disabled={busy || !moving.length || !to || to === from}
          onClick={() =>
            void run(async () => {
              const ok = await actions.moveStock(moving, Number(from), Number(to))
              if (ok) {
                setFrom('')
                setTo('')
              }
              return ok
            })
          }
        >
          {t.admin.move}
        </button>
      </span>
      {from && moving.length < picked.length && (
        <span className="small muted">{t.admin.moveSome(moving.length, picked.length)}</span>
      )}
      <button type="button" className="secondary small-button" onClick={onClear}>
        {t.admin.clearSelection}
      </button>
    </div>
  )
}
