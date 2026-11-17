import { type FormEvent, useState } from 'react'
import type { Category, ItemOut } from './api'
import { CATEGORIES, categoryName, iconCategory } from './categories'
import { useHouse } from './house'
import { IconPicker } from './IconPicker'
import { t } from './strings'
import { fullName } from './variants'

/** An item's details: name, variant, group, restocking, icon; or delete it. */
export function ItemForm({
  item,
  onDone,
  onDeleted,
}: {
  item: ItemOut
  onDone: () => void
  onDeleted: () => void
}) {
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
    onDeleted()
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
