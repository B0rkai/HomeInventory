import { type FormEvent, useState } from 'react'
import type { RequestOut } from './api'
import { useHouse } from './house'
import { t } from './strings'
import { parseFullName } from './variants'

/**
 * Takes something written on the shopping list into the inventory: the item (an existing
 * one of the same name and variant, or a new one), still on the list, its place chosen
 * once it's bought.
 */
export function KeepForm({ request, onClose }: { request: RequestOut; onClose: () => void }) {
  const { actions } = useHouse()
  // "Konzerv · bab" written on the list reads as a name and a variant.
  const written = parseFullName(request.name ?? '')
  const [name, setName] = useState(written.name)
  const [variant, setVariant] = useState(written.variant ?? '')
  const [restock, setRestock] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const saved = await actions.keepRequest(request.id, {
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
        <button type="submit" disabled={saving || !name.trim()}>
          {t.todo.keepSave}
        </button>
      </div>
    </form>
  )
}
