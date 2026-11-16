import { iconOf, type IconKind } from './icons'

/** An item's or place's icon (if any) and name. */
export function Named({
  thing,
  kind,
}: {
  thing: { name: string; icon: string | null }
  kind: IconKind
}) {
  const icon = iconOf(thing, kind)
  return (
    <span className="named">
      {icon && (
        <span className="icon-glyph" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{thing.name}</span>
    </span>
  )
}
