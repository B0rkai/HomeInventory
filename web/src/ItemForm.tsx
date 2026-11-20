import { type FormEvent, type KeyboardEvent, useId, useState } from 'react'
import type { ItemOut } from './api'
import { GroupSelect } from './GroupSelect'
import { useHouse } from './house'
import { IconPicker } from './IconPicker'
import { t } from './strings'
import { byItem, familyNames, fullName, parseFullName } from './variants'

/** An item's details: name, variant, group, restocking, what recipes can use instead, icon;
 * or delete it. */
export function ItemForm({
  item,
  onDone,
  onDeleted,
}: {
  item: ItemOut
  onDone: () => void
  onDeleted: () => void
}) {
  const { house, actions } = useHouse()
  const [name, setName] = useState(item.name)
  const [variant, setVariant] = useState(item.variant ?? '')
  const [groupId, setGroupId] = useState(item.group_id)
  const [icon, setIcon] = useState(item.icon)
  const [restock, setRestock] = useState(item.restock)
  const [anyVariant, setAnyVariant] = useState(item.any_variant)
  const [family, setFamily] = useState(item.family ?? '')
  const id = useId()
  const items = house?.items ?? []
  // By name: one not in the catalogue yet joins it on saving.
  const [substitutes, setSubstitutes] = useState(() =>
    item.substitute_ids.flatMap((sid) => {
      const other = items.find((i) => i.id === sid)
      return other ? [fullName(other)] : []
    }),
  )
  const [adding, setAdding] = useState('')
  const fold = (text: string) => text.trim().toLocaleLowerCase('hu')
  function addSubstitute() {
    const text = adding.trim()
    if (
      text &&
      fold(text) !== fold(fullName(item)) &&
      !substitutes.some((s) => fold(s) === fold(text))
    )
      setSubstitutes([...substitutes, text])
    setAdding('')
  }
  function addKeys(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds it, it doesn't save the item.
    if (event.key === 'Enter') {
      event.preventDefault()
      addSubstitute()
    }
  }
  // Only a supply kept in kinds has variants to choose between.
  const hasVariants =
    variant.trim() !== '' ||
    (house?.items.filter((i) => i.name.toLocaleLowerCase('hu') === name.toLocaleLowerCase('hu'))
      .length ?? 0) > 1
  const [saving, setSaving] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const saved = await actions.updateItem(item.id, {
      name,
      variant,
      group_id: groupId,
      icon,
      restock,
      // Only what changed: "any variant" reaches the item's other variants.
      ...(anyVariant !== item.any_variant && { any_variant: anyVariant }),
      ...(family.trim() !== (item.family ?? '') && { family }),
      substitutes: substitutes.map((text) => parseFullName(text)),
    })
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
        {/* Unset follows the icon, as chosen below. */}
        <GroupSelect item={{ name, icon }} value={groupId} onChange={setGroupId} />
      </label>
      <label className="check">
        <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
        <span>
          {t.items.restock}
          <span className="small muted"> – {t.items.restockHint}</span>
        </span>
      </label>
      {hasVariants && (
        <label className="check">
          <input
            type="checkbox"
            checked={anyVariant}
            onChange={(e) => {
              // It's a family named after the item.
              setAnyVariant(e.target.checked)
              if (e.target.checked) setFamily(name.trim())
              else if (
                family.trim().toLocaleLowerCase('hu') === name.trim().toLocaleLowerCase('hu')
              )
                setFamily('')
            }}
          />
          <span>
            {t.items.anyVariant}
            <span className="small muted"> – {t.items.anyVariantHint}</span>
          </span>
        </label>
      )}
      <label>
        {t.items.family}
        <input
          value={family}
          onChange={(e) => setFamily(e.target.value)}
          placeholder={t.items.familyPlaceholder}
          list={`${id}-families`}
          maxLength={60}
          autoComplete="off"
        />
        <span className="small muted">{t.items.familyHint}</span>
        <datalist id={`${id}-families`}>
          {familyNames(items).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <fieldset className="substitutes">
        <legend>{t.items.substitutes}</legend>
        <p className="small muted">{t.items.substitutesHint}</p>
        {substitutes.length > 0 && (
          <ul className="chips">
            {substitutes.map((text) => (
              <li key={text} className="chip">
                {text}
                <button
                  type="button"
                  className="icon"
                  aria-label={t.items.removeSubstitute(text)}
                  onClick={() => setSubstitutes(substitutes.filter((s) => s !== text))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <input
            aria-label={t.items.substitutes}
            placeholder={t.items.substitutePlaceholder}
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            onKeyDown={addKeys}
            list={`${id}-items`}
            maxLength={103}
            autoComplete="off"
          />
          <button
            type="button"
            className="secondary"
            disabled={!adding.trim()}
            onClick={addSubstitute}
          >
            {t.add}
          </button>
        </div>
        <datalist id={`${id}-items`}>
          {[...items]
            .filter((other) => other.id !== item.id)
            .sort(byItem)
            .map((other) => (
              <option key={other.id} value={fullName(other)} />
            ))}
        </datalist>
      </fieldset>
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
