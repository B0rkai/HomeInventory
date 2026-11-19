import { type FormEvent, useId, useState } from 'react'
import type { Category } from './api'
import { CATEGORIES, categoryName } from './categories'
import { useHouse } from './house'
import { COMMON_ITEMS } from './icons'
import { t } from './strings'
import { placePath, treeOrder } from './tree'
import { byItem, findItem, fullName, parseFullName } from './variants'

// The server's limits.
const NAME_MAX_LENGTH = 60
const VARIANT_MAX_LENGTH = 40

/**
 * A new item in one row: name, variant, group and where it's kept (or nowhere yet). A
 * known one is just kept at the place. `locationId`: the place, when added from its row.
 * Clears itself after each, so a few go in one after another.
 */
export function AdminAddItem({ locationId }: { locationId?: number }) {
  const id = useId()
  const { house, actions } = useHouse()
  const [name, setName] = useState('')
  const [variant, setVariant] = useState('')
  const [category, setCategory] = useState('')
  const [place, setPlace] = useState('')
  const [saving, setSaving] = useState(false)
  if (!house) return null
  const { items, stock, locations } = house
  const at = locationId ?? (place ? Number(place) : null)
  // "Konzerv · borsó" picked from the list fills both; the variant field wins when typed in.
  const parsed = parseFullName(name)
  const chosenVariant = variant.trim() || parsed.variant
  const known = findItem(items, parsed.name, chosenVariant)
  const keptAt = (itemId: number) =>
    at !== null && stock.some((row) => row.item_id === itemId && row.location_id === at)
  // Nothing to add: kept there already, or known and no place given.
  const nothing = Boolean(known && (at === null || keptAt(known.id)))
  const names = new Set(items.map((item) => item.name.toLocaleLowerCase('hu')))
  const suggestions = [
    ...items
      .filter((item) => !keptAt(item.id))
      .sort(byItem)
      .map(fullName),
    ...COMMON_ITEMS.filter((common) => !names.has(common.toLocaleLowerCase('hu'))),
  ]
  const variants = parsed.name
    ? items
        .filter(
          (item) =>
            item.variant &&
            !keptAt(item.id) &&
            item.name.toLocaleLowerCase('hu') === parsed.name.toLocaleLowerCase('hu'),
        )
        .map((item) => item.variant!)
    : []

  async function add(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const added = await actions.keepItem(
      parsed.name,
      chosenVariant,
      at,
      category ? (category as Category) : undefined,
    )
    setSaving(false)
    if (added) {
      setName('')
      setVariant('')
    }
  }

  return (
    <form className="admin-filters admin-add" onSubmit={add}>
      <input
        className="search"
        aria-label={t.admin.addItem}
        placeholder={t.admin.addItemName}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={NAME_MAX_LENGTH + VARIANT_MAX_LENGTH + 3}
        list={`${id}-names`}
        autoComplete="off"
        required
      />
      <input
        aria-label={t.admin.variant}
        placeholder={t.admin.variantOptional}
        value={variant}
        onChange={(event) => setVariant(event.target.value)}
        maxLength={VARIANT_MAX_LENGTH}
        list={`${id}-variants`}
        autoComplete="off"
      />
      {/* A known item keeps its group. */}
      <select
        aria-label={t.admin.group}
        value={category}
        disabled={Boolean(known)}
        onChange={(event) => setCategory(event.target.value)}
      >
        <option value="">{t.admin.groupAuto}</option>
        {CATEGORIES.map((option) => (
          <option key={option} value={option}>
            {categoryName(option)}
          </option>
        ))}
      </select>
      {locationId === undefined && (
        <select
          aria-label={t.admin.keepAt}
          value={place}
          onChange={(event) => setPlace(event.target.value)}
        >
          <option value="">{t.admin.keepNowhere}</option>
          {treeOrder(locations).map((location) => (
            <option key={location.id} value={location.id}>
              {placePath(locations, location.id)}
            </option>
          ))}
        </select>
      )}
      <button type="submit" disabled={saving || !parsed.name || nothing}>
        + {t.add}
      </button>
      {known && (
        <span className="small muted">
          {at === null
            ? t.admin.knownNowhere
            : keptAt(known.id)
              ? t.admin.keptThere
              : t.admin.knownItem}
        </span>
      )}
      <datalist id={`${id}-names`}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <datalist id={`${id}-variants`}>
        {variants.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </form>
  )
}
