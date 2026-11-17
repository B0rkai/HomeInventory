import { type FormEvent, useState } from 'react'
import type { ItemOut } from './api'
import { useHouse } from './house'
import { IconPicker } from './IconPicker'
import { Named } from './Named'
import { t } from './strings'
import { byItem, fullName } from './variants'

/** The catalogue: rename, group or delete items. Adding happens on a place's page. */
export function ItemsPage() {
  const { house } = useHouse()
  const [editingId, setEditingId] = useState<number>()
  if (!house) return null
  const { items, stock } = house

  const categories = [...new Set(items.map((item) => item.category).filter((c) => c !== null))]
  const groups = new Map<string, ItemOut[]>()
  for (const item of [...items].sort(byItem)) {
    const category = item.category ?? t.items.noCategory
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  const sortedGroups = [...groups].sort(([a], [b]) =>
    // Uncategorised last.
    a === t.items.noCategory ? 1 : b === t.items.noCategory ? -1 : a.localeCompare(b, 'hu'),
  )

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
        <section key={category} className="card">
          <h3>{category}</h3>
          <ul className="item-list">
            {groupItems.map((item) =>
              item.id === editingId ? (
                <li key={item.id}>
                  <ItemForm
                    item={item}
                    categories={categories}
                    onDone={() => setEditingId(undefined)}
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

function ItemForm({
  item,
  categories,
  onDone,
}: {
  item: ItemOut
  categories: string[]
  onDone: () => void
}) {
  const { actions } = useHouse()
  const [name, setName] = useState(item.name)
  const [variant, setVariant] = useState(item.variant ?? '')
  const [category, setCategory] = useState(item.category ?? '')
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
    if (window.confirm(t.items.confirmDelete(fullName(item)))) await actions.deleteItem(item.id)
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
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t.items.categoryPlaceholder}
          maxLength={40}
          list="categories"
          autoComplete="off"
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        <span>
          {t.items.restock}
          <span className="small muted"> – {t.items.restockHint}</span>
        </span>
      </label>
      <IconPicker kind="item" name={name} value={icon} onChange={setIcon} />
      <datalist id="categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
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
