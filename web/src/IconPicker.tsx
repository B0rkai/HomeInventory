import { guessIcon, iconChoices, type IconKind } from './icons'
import { IconTile } from './Named'
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
  const current = value ?? guess
  const option = (icon: string | null, label: string) => (
    <button
      key={icon ?? 'auto'}
      type="button"
      role="radio"
      aria-checked={value === icon}
      aria-label={label}
      title={label}
      className="icon-option"
      onClick={() => onChange(icon)}
    >
      {/* A dash on the 'none' tile, not the name's first letter. */}
      <IconTile icon={icon ?? guess} name={icon === '' ? '–' : name} kind={kind} />
      {icon === null && <span>{t.icons.auto}</span>}
      {icon === '' && <span>{t.icons.none}</span>}
    </button>
  )
  return (
    // Folded by default: some 50 icons would push the rest of the form off the screen.
    <details className="icon-picker">
      <summary>
        {t.icons.label}: <IconTile icon={current} name={name} kind={kind} />
        {value === null && <span className="muted">({t.icons.auto})</span>}
      </summary>
      <div role="radiogroup" aria-label={t.icons.label}>
        {option(null, t.icons.autoHint)}
        {option('', t.icons.none)}
        {iconChoices(kind).map((icon) => option(icon, icon))}
      </div>
    </details>
  )
}
