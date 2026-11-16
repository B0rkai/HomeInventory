import { iconOf, type IconKind } from './icons'

/**
 * An item's or place's icon and name. Without an icon the first letter stands in, so
 * names in a list always start in line.
 */
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
      {icon ? (
        <span className="icon-glyph" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <span className="icon-glyph monogram" aria-hidden="true">
          {thing.name.charAt(0).toLocaleUpperCase('hu')}
        </span>
      )}
      <span>{thing.name}</span>
    </span>
  )
}
