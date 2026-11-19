import type { ItemOut, StockOut } from './api'
import { useHouse } from './house'
import { IconArt } from './IconArt'
import { iconOf } from './iconLookup'
import { t } from './strings'
import type { Shortage } from './tree'
import { asGroup, fullName, groupKey, interchangeable } from './variants'

// More than this many and the rest is a "+".
const MAX_ICONS = 5

/**
 * What's out, then what's low, as each item's icon in the shortage colour (its first
 * letter without one). Past five, a "+" says there's more. Nothing when all is plenty.
 */
export function ShortageBadge({ shortage }: { shortage: Shortage }) {
  const { house } = useHouse()
  const items = house?.items ?? []
  const itemsById = new Map(items.map((item) => [item.id, item]))
  // An item short in two places inside (say, two WCs) shows once, at its worst; a family
  // once for all its members, as low while any of them is only low.
  const shown = new Map<string, { item: ItemOut; level: 'out' | 'low' }>()
  const add = (rows: StockOut[], level: 'out' | 'low') => {
    for (const row of rows) {
      const item = itemsById.get(row.item_id)
      if (!item) continue
      const key = groupKey(item)
      const before = shown.get(key)
      if (!before) shown.set(key, { item: asGroup(item, items), level })
      else if (interchangeable(item)) before.level = level
    }
  }
  add(shortage.out, 'out')
  add(shortage.low, 'low')
  // Out first.
  const list = [...shown.values()].sort(
    (a, b) => Number(a.level === 'low') - Number(b.level === 'low'),
  )
  if (!list.length) return null
  const rest = list.length - MAX_ICONS

  return (
    <span className="badges">
      {list.slice(0, rest > 0 ? MAX_ICONS : undefined).map(({ item, level }) => {
        const icon = iconOf(item, 'item')
        const label = `${t.levels[level]}: ${fullName(item)}`
        return (
          <span
            key={groupKey(item)}
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
          data-level={list[MAX_ICONS].level}
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
