import { type FormEvent, useId, useState } from 'react'
import { t } from './strings'
import { parseFullName } from './variants'

// The server's limits.
const NAME_MAX_LENGTH = 60
const VARIANT_MAX_LENGTH = 40

type Props = {
  // Offered for the name: "Cukor", or a variant as "Konzerv · borsó".
  suggestions: string[]
  // Known variants of a name, offered once it's typed.
  variantsOf: (name: string) => string[]
  // Resolves true when saved; the form then clears itself.
  onSubmit: (name: string, variant: string | null) => Promise<boolean>
}

/** Adding an item to a place: its name and, optionally, which kind ("kukorica", "35 l"). */
export function AddItemForm({ suggestions, variantsOf, onSubmit }: Props) {
  const id = useId()
  const [name, setName] = useState('')
  const [variant, setVariant] = useState('')
  const [saving, setSaving] = useState(false)
  // A picked "Konzerv · borsó" fills both; the variant field wins when typed in.
  const parsed = parseFullName(name)
  const chosenVariant = variant.trim() || parsed.variant

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const saved = await onSubmit(parsed.name, chosenVariant)
    setSaving(false)
    if (saved) {
      setName('')
      setVariant('')
    }
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <label htmlFor={id}>{t.place.addItem}</label>
      <input
        id={id}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t.place.addItemPlaceholder}
        maxLength={NAME_MAX_LENGTH + VARIANT_MAX_LENGTH + 3}
        list={`${id}-names`}
        autoComplete="off"
        enterKeyHint="next"
        required
      />
      <div className="row">
        <input
          aria-label={t.items.variant}
          value={variant}
          onChange={(event) => setVariant(event.target.value)}
          placeholder={t.place.variantPlaceholder}
          maxLength={VARIANT_MAX_LENGTH}
          list={`${id}-variants`}
          autoComplete="off"
          enterKeyHint="done"
        />
        <button type="submit" disabled={saving || !parsed.name}>
          {t.add}
        </button>
      </div>
      <datalist id={`${id}-names`}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <datalist id={`${id}-variants`}>
        {(parsed.name ? variantsOf(parsed.name) : []).map((known) => (
          <option key={known} value={known} />
        ))}
      </datalist>
    </form>
  )
}
