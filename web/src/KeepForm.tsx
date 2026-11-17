import { type FormEvent, useId, useState } from 'react'
import type { RequestOut } from './api'
import { useHouse } from './house'
import { t } from './strings'
import { placePath, treeOrder } from './tree'
import { parseFullName } from './variants'

/**
 * Takes something written on the shopping list into the inventory once it's bought: the
 * item (an existing one of the same name and variant, or a new one) at plenty in a place.
 */
export function KeepForm({ request, onClose }: { request: RequestOut; onClose: () => void }) {
  const id = useId()
  const { house, actions } = useHouse()
  // "Konzerv · bab" written on the list reads as a name and a variant.
  const written = parseFullName(request.name ?? '')
  const [name, setName] = useState(written.name)
  const [variant, setVariant] = useState(written.variant ?? '')
  const [place, setPlace] = useState('')
  const [restock, setRestock] = useState(false)
  const [saving, setSaving] = useState(false)
  if (!house) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const saved = await actions.keepRequest(request.id, {
      location_id: Number(place),
      name: name.trim(),
      variant: variant.trim() || null,
      restock,
    })
    setSaving(false)
    if (saved) onClose()
  }

  return (
    <form className="item-form keep-form" onSubmit={submit}>
      <p className="small muted">{t.todo.keepHint}</p>
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
        />
      </label>
      <label htmlFor={`${id}-place`}>
        {t.todo.keepPlace}
        <select
          id={`${id}-place`}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          required
        >
          <option value="" disabled>
            {t.todo.keepPlacePick}
          </option>
          {treeOrder(house.locations).map((location) => (
            <option key={location.id} value={location.id}>
              {placePath(house.locations, location.id)}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        <span>
          {t.items.restock}
          <span className="small muted"> · {t.items.restockHint}</span>
        </span>
      </label>
      <div className="actions">
        <button type="button" className="secondary" onClick={onClose}>
          {t.cancel}
        </button>
        <button type="submit" disabled={saving || !name.trim() || !place}>
          {t.todo.keepSave}
        </button>
      </div>
    </form>
  )
}
