import { guessIcon, iconChoices, type IconKind } from './icons'
import { t } from './strings'

/** Pick an icon: automatic (null, guessed from the name), none ('') or one from the list. */
export function IconPicker({
  kind,
  name,
  value,
  onChange,
}: {
  kind: IconKind
  name: string
  value: string | null
  onChange: (icon: string | null) => void
}) {
  const guess = guessIcon(name, kind)
  const option = (icon: string | null, label: string, title: string) => (
    <button
      key={icon ?? 'auto'}
      type="button"
      role="radio"
      aria-checked={value === icon}
      aria-label={title}
      className="icon-option"
      onClick={() => onChange(icon)}
    >
      {label}
    </button>
  )
  const current = value === null ? guess : value
  return (
    // Folded by default: 40-odd emoji would push the rest of the form off the screen.
    <details className="icon-picker">
      <summary>
        {t.icons.label}:{' '}
        <span className="icon-current">
          {current || '—'} {value === null && <span className="muted">({t.icons.auto})</span>}
        </span>
      </summary>
      <div role="radiogroup" aria-label={t.icons.label}>
        {option(null, guess ? `${guess} ${t.icons.auto}` : t.icons.auto, t.icons.autoHint)}
        {option('', t.icons.none, t.icons.none)}
        {iconChoices(kind).map((icon) => option(icon, icon, icon))}
      </div>
    </details>
  )
}
