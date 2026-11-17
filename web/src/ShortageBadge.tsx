import type { ItemOut, StockOut } from './api'
import { useHouse } from './house'
import { IconArt } from './IconArt'
import { iconOf } from './iconLookup'
import { t } from './strings'
import type { Shortage } from './tree'
import { fullName } from './variants'

// More than this many and the rest is a "+".
const MAX_ICONS = 5

/**
 * What's out, then what's low, as each item's icon in the shortage colour (its first
 * letter without one). Past five, a "+" says there's more. Nothing when all is plenty.
 */
export function ShortageBadge({ shortage }: { shortage: Shortage }) {
  const { house } = useHouse()
  const itemsById = new Map(house?.items.map((item) => [item.id, item]))
  // An item short in two places inside (say, two WCs) shows once, at its worst.
  const seen = new Set<number>()
  const shown: { item: ItemOut; level: 'out' | 'low' }[] = []
  const add = (rows: StockOut[], level: 'out' | 'low') => {
    for (const row of rows) {
      const item = itemsById.get(row.item_id)
      if (!item || seen.has(item.id)) continue
      seen.add(item.id)
      shown.push({ item, level })
    }
  }
  add(shortage.out, 'out')
  add(shortage.low, 'low')
  if (!shown.length) return null
  const rest = shown.length - MAX_ICONS

  return (
    <span className="badges">
      {shown.slice(0, rest > 0 ? MAX_ICONS : undefined).map(({ item, level }) => {
        const icon = iconOf(item, 'item')
        const label = `${t.levels[level]}: ${fullName(item)}`
        return (
          <span
            key={item.id}
            className="badge one"
            data-level={level}
            title={label}
            aria-label={label}
            role="img"
          >
            {icon ? <IconArt name={icon} /> : item.name.charAt(0).toLocaleUpperCase('hu')}
          </span>
        )
      })}
      {rest > 0 && (
        <span
          className="badge more"
          data-level={shown[MAX_ICONS].level}
          title={t.home.moreShort(rest)}
          aria-label={t.home.moreShort(rest)}
          role="img"
        >
          +
        </span>
      )}
    </span>
  )
}
