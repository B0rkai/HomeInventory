import { IconArt } from './IconArt'
import { iconOf } from './iconLookup'
import { hueOf, type Hue, type IconKind } from './icons'
import type { Category, RecipeOut } from './api'

type Thing = {
  name: string
  icon: string | null
  variant?: string | null
  // An item's chosen group colours its tile, letter tiles too.
  category?: Category | null
}

/** A two-tone tile: the icon in its group's colour, or the name's first letter. */
export function IconTile({
  icon,
  name,
  kind,
  hue = hueOf(icon, kind),
}: {
  icon: string
  name: string
  kind: IconKind
  hue?: Hue
}) {
  return (
    <span className={`tile hue-${hue}`} aria-hidden="true">
      {icon ? <IconArt name={icon} /> : name.charAt(0).toLocaleUpperCase('hu')}
    </span>
  )
}

/** An item's or place's tile and name (and variant); tiles keep names in a list lined up.
 * `note` follows the name, wrapping beside the tile, not under it. */
export function Named({ thing, kind, note }: { thing: Thing; kind: IconKind; note?: string }) {
  return (
    <span className="named">
      <IconTile
        icon={iconOf(thing, kind)}
        name={thing.name}
        kind={kind}
        hue={thing.category ?? undefined}
      />
      <span>
        {thing.name}
        {thing.variant && <span className="variant"> · {thing.variant}</span>}
        {note && <span className="small muted any-kind"> · {note}</span>}
      </span>
    </span>
  )
}

/** A recipe's tile and name. */
export function RecipeName({ recipe }: { recipe: Pick<RecipeOut, 'name' | 'icon'> }) {
  return (
    <span className="named">
      <IconTile icon={iconOf(recipe, 'recipe')} name={recipe.name} kind="recipe" hue="food" />
      <span>{recipe.name}</span>
    </span>
  )
}

/** A small chef's hat: planned cookings need it (named in the label). */
export function ReservedMark({ text }: { text: string }) {
  return (
    <span className="no-restock reserved" role="img" aria-label={text} title={text}>
      <IconArt name="chef-hat" />
    </span>
  )
}
