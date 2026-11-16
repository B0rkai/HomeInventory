import { type FormEvent, useId, useState } from 'react'
import { t } from './strings'

const MAX_LENGTH = 60 // the server's limit for names

type Props = {
  label: string
  placeholder?: string
  // Suggestions offered while typing (e.g. items not kept here yet).
  suggestions?: string[]
  initial?: string
  // Defaults to Save when editing a name, Add otherwise.
  submitLabel?: string
  // Resolves true when saved; the form then clears itself.
  onSubmit: (name: string) => Promise<boolean>
  onCancel?: () => void
}

/** One text field and a button: adding a place or an item, renaming one. */
export function AddForm({
  label,
  placeholder,
  suggestions,
  initial = '',
  submitLabel = initial ? t.save : t.add,
  onSubmit,
  onCancel,
}: Props) {
  const id = useId()
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const saved = await onSubmit(value.trim())
    setSaving(false)
    if (saved && !initial) setValue('')
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          maxLength={MAX_LENGTH}
          list={suggestions ? `${id}-list` : undefined}
          autoComplete="off"
          enterKeyHint="done"
          required
        />
        <button type="submit" disabled={saving || !value.trim() || value.trim() === initial}>
          {submitLabel}
        </button>
      </div>
      {suggestions && (
        <datalist id={`${id}-list`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {onCancel && (
        <button type="button" className="secondary" onClick={onCancel}>
          {t.cancel}
        </button>
      )}
    </form>
  )
}
