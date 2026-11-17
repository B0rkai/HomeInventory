import { type FormEvent, useId, useState } from 'react'
import { useHouse } from './house'
import { t } from './strings'
import { placePath, treeOrder } from './tree'
import { byItem, findItem, fullName, parseFullName } from './variants'

const MAX_LENGTH = 60 // the server's limit for names

/**
 * Adds a one-off to-do ("Szerelő hívása"), for the whole house or a place, or writes
 * something on the shopping list ("Elem"). Something to buy that the inventory keeps
 * goes on the list as that item, in one of its places, whatever its level (more for a
 * party); the rest as free text. Folded into two buttons until one is needed, so it
 * doesn't take up the list's room.
 */
export function OneOffForm() {
  const id = useId()
  const { house, actions } = useHouse()
  const [open, setOpen] = useState<'chore' | 'buy'>()
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [saving, setSaving] = useState(false)
  if (!house) return null
  const ordered = treeOrder(house.locations)
  // Typed (or picked) the name of an item kept somewhere: list it there.
  const typed = parseFullName(name)
  const match = open === 'buy' ? findItem(house.items, typed.name, typed.variant) : undefined
  const keptAt = match
    ? ordered.filter((l) =>
        house.stock.some((row) => row.item_id === match.id && row.location_id === l.id),
      )
    : []
  const listAt = keptAt.find((l) => String(l.id) === place) ?? keptAt[0]
  const suggestions = house.items
    .filter((item) => house.stock.some((row) => row.item_id === item.id))
    .sort(byItem)
    .map(fullName)
  if (!open) {
    return (
      <div className="actions one-off-toggle">
        <button type="button" className="secondary small-button" onClick={() => setOpen('buy')}>
          + {t.todo.addToList}
        </button>
        <button type="button" className="secondary small-button" onClick={() => setOpen('chore')}>
          + {t.todo.addOneOff}
        </button>
      </div>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    let saved: unknown = true
    if (match && listAt) actions.requestStock(listAt.id, match.id)
    else if (open === 'buy') saved = await actions.addToList(name.trim())
    else saved = await actions.addChore(place ? Number(place) : null, name.trim(), true)
    setSaving(false)
    if (saved) {
      setName('')
      setPlace('')
      setOpen(undefined)
    }
  }

  return (
    <form className="card add-form one-off" onSubmit={submit}>
      <label htmlFor={id}>{open === 'buy' ? t.todo.addToList : t.todo.addOneOff}</label>
      <input
        id={id}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={open === 'buy' ? t.todo.addToListPlaceholder : t.todo.addOneOffPlaceholder}
        maxLength={MAX_LENGTH}
        list={open === 'buy' ? `${id}-items` : undefined}
        autoComplete="off"
        enterKeyHint="done"
        autoFocus
        required
      />
      {open === 'buy' && (
        <datalist id={`${id}-items`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {listAt && keptAt.length === 1 && (
        <p className="small muted">{t.todo.fromInventory(placePath(house.locations, listAt.id))}</p>
      )}
      <div className="row">
        {/* An inventory item goes on the list in one of its places. */}
        {keptAt.length > 1 && (
          <select
            aria-label={t.todo.oneOffPlace}
            value={listAt?.id}
            onChange={(event) => setPlace(event.target.value)}
          >
            {keptAt.map((location) => (
              <option key={location.id} value={location.id}>
                {placePath(house.locations, location.id)}
              </option>
            ))}
          </select>
        )}
        {/* A one-off is the house's or a place's; free text to buy has no place. */}
        {open === 'chore' && (
          <select
            aria-label={t.todo.oneOffPlace}
            value={place}
            onChange={(event) => setPlace(event.target.value)}
          >
            <option value="">{t.home.wholeHouse}</option>
            {ordered.map((location) => (
              <option key={location.id} value={location.id}>
                {placePath(house.locations, location.id)}
              </option>
            ))}
          </select>
        )}
        <button type="submit" disabled={saving || !name.trim()}>
          {t.add}
        </button>
      </div>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setPlace('')
          setOpen(undefined)
        }}
      >
        {t.cancel}
      </button>
    </form>
  )
}
