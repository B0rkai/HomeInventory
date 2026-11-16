import { DRAWN_ICONS } from './drawnIcons'
import { guessIcon, type IconKind } from './icons'
import { TABLER_ICONS } from './tablerIcons.gen'

/** The SVG children for an icon name; empty when there is no such icon. */
export function iconArt(name: string): string {
  return TABLER_ICONS[name] ?? DRAWN_ICONS[name] ?? ''
}

/** The icon to show: the one chosen, else a guess from the name; '' for none. */
export function iconOf(thing: { name: string; icon: string | null }, kind: IconKind): string {
  if (thing.icon === '') return ''
  // A stored name the set no longer has falls back to the guess.
  return thing.icon && iconArt(thing.icon) ? thing.icon : guessIcon(thing.name, kind)
}
