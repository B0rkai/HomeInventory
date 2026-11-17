import { type FormEvent, useId, useState } from 'react'
import { useHouse } from './house'
import { t } from './strings'
import { placePath, treeOrder } from './tree'

const MAX_LENGTH = 60 // the server's limit for names

/**
 * Adds a one-off to-do ("Szerelő hívása"), for the whole house or a place. Folded into a
 * button until it's needed, so it doesn't take up the list's room.
 */
export function OneOffForm() {
  const id = useId()
  const { house, actions } = useHouse()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [saving, setSaving] = useState(false)
  if (!house) return null
  if (!open) {
    return (
      <div className="actions one-off-toggle">
        <button type="button" className="secondary small-button" onClick={() => setOpen(true)}>
          + {t.todo.addOneOff}
        </button>
      </div>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const saved = await actions.addChore(place ? Number(place) : null, name.trim(), true)
    setSaving(false)
    if (saved) {
      setName('')
      setOpen(false)
    }
  }

  return (
    <form className="card add-form one-off" onSubmit={submit}>
      <label htmlFor={id}>{t.todo.addOneOff}</label>
      <input
        id={id}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t.todo.addOneOffPlaceholder}
        maxLength={MAX_LENGTH}
        autoComplete="off"
        enterKeyHint="done"
        autoFocus
        required
      />
      <div className="row">
        <select
          aria-label={t.todo.oneOffPlace}
          value={place}
          onChange={(event) => setPlace(event.target.value)}
        >
          <option value="">{t.home.wholeHouse}</option>
          {treeOrder(house.locations).map((location) => (
            <option key={location.id} value={location.id}>
              {placePath(house.locations, location.id)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={saving || !name.trim()}>
          {t.add}
        </button>
      </div>
      <button type="button" className="secondary" onClick={() => setOpen(false)}>
        {t.cancel}
      </button>
    </form>
  )
}
