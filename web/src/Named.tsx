import { IconArt } from './IconArt'
import { iconOf } from './iconLookup'
import { hueOf, type IconKind } from './icons'

type Thing = { name: string; icon: string | null; variant?: string | null }

/** A two-tone tile: the icon in its group's colour, or the name's first letter. */
export function IconTile({ icon, name, kind }: { icon: string; name: string; kind: IconKind }) {
  return (
    <span className={`tile hue-${hueOf(icon, kind)}`} aria-hidden="true">
      {icon ? <IconArt name={icon} /> : name.charAt(0).toLocaleUpperCase('hu')}
    </span>
  )
}

/** An item's or place's tile and name (and variant); tiles keep names in a list lined up. */
export function Named({ thing, kind }: { thing: Thing; kind: IconKind }) {
  return (
    <span className="named">
      <IconTile icon={iconOf(thing, kind)} name={thing.name} kind={kind} />
      <span>
        {thing.name}
        {thing.variant && <span className="variant"> · {thing.variant}</span>}
      </span>
    </span>
  )
}
