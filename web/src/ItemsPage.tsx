import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { Category, ItemOut } from './api'
import { CATEGORIES, categoryName, groupByCategory, iconCategory } from './categories'
import { useHouse } from './house'
import { IconPicker } from './IconPicker'
import { Named } from './Named'
import { t } from './strings'
import { byItem, fullName } from './variants'

/**
 * The catalogue: rename, group or delete items. Adding happens on a place's page, which
 * also links here with `edit` set: that item's form opens, and closing it goes back.
 */
export function ItemsPage({ edit }: { edit?: number }) {
  const { house } = useHouse()
  const [editingId, setEditingId] = useState(edit)
  const editing = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (edit !== undefined) editing.current?.scrollIntoView({ block: 'center' })
  }, [edit])
  if (!house) return null
  const { items, stock } = house

  const sortedGroups = groupByCategory(items, byItem)

  return (
    <>
      <h2>{t.items.title}</h2>
      <p className="muted">{t.items.hint}</p>
      {items.length === 0 && (
        <div className="card">
          <p>{t.items.empty}</p>
        </div>
      )}
      {sortedGroups.map(([category, groupItems]) => (
        <section key={category ?? ''} className="card">
          <h3>{categoryName(category)}</h3>
          <ul className="item-list">
            {groupItems.map((item) =>
              item.id === editingId ? (
                <li key={item.id} ref={editing}>
                  <ItemForm
                    item={item}
                    onDone={() =>
                      // Opened from a place: back to it.
                      item.id === edit ? window.history.back() : setEditingId(undefined)
                    }
                  />
                </li>
              ) : (
                <li key={item.id}>
                  <button type="button" className="item-row" onClick={() => setEditingId(item.id)}>
                    <Named thing={item} kind="item" />
                    <span className="muted small">
                      {!item.restock && `${t.items.noRestock} · `}
                      {t.items.places(stock.filter((row) => row.item_id === item.id).length)}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </>
  )
}

function ItemForm({ item, onDone }: { item: ItemOut; onDone: () => void }) {
  const { actions } = useHouse()
  const [name, setName] = useState(item.name)
  const [variant, setVariant] = useState(item.variant ?? '')
  const [category, setCategory] = useState(item.category)
  const [icon, setIcon] = useState(item.icon)
  const [restock, setRestock] = useState(item.restock)
  const [saving, setSaving] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const saved = await actions.updateItem(item.id, { name, variant, category, icon, restock })
    setSaving(false)
    if (saved) onDone()
  }

  async function remove() {
    if (!window.confirm(t.items.confirmDelete(fullName(item)))) return
    await actions.deleteItem(item.id)
    onDone()
  }

  return (
    <form className="item-form" onSubmit={save}>
      <label>
        {t.items.name}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </label>
      <label>
        {t.items.variant}
        <input
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          placeholder={t.items.variantPlaceholder}
          maxLength={40}
          autoComplete="off"
        />
      </label>
      <label>
        {t.items.category}
        <select
          value={category ?? ''}
          onChange={(e) => setCategory((e.target.value || null) as Category | null)}
        >
          {/* Unset follows the icon, as chosen below. */}
          <option value="">
            {t.items.categoryAuto(categoryName(iconCategory({ name, icon })))}
          </option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t.categories[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        <span>
          {t.items.restock}
          <span className="small muted"> – {t.items.restockHint}</span>
        </span>
      </label>
      <IconPicker kind="item" name={name} value={icon} onChange={setIcon} />
      <div className="actions spread">
        <button type="button" className="danger" onClick={remove} disabled={saving}>
          {t.items.delete}
        </button>
        <span className="actions">
          <button type="button" className="secondary" onClick={onDone} disabled={saving}>
            {t.cancel}
          </button>
          <button type="submit" disabled={saving || !name.trim()}>
            {t.save}
          </button>
        </span>
      </div>
    </form>
  )
}
