import type { StockOut } from './api'
import { useHouse } from './house'
import { IconArt } from './IconArt'
import { iconOf } from './iconLookup'
import { t } from './strings'
import type { Shortage } from './tree'
import { fullName } from './variants'

/**
 * What's out and what's low, as two small counters in their colours; a single item shows
 * as its icon instead of a "1". Nothing when all is plenty.
 */
export function ShortageBadge({ shortage }: { shortage: Shortage }) {
  return (
    <>
      <Counter rows={shortage.out} level="out" />
      <Counter rows={shortage.low} level="low" />
    </>
  )
}

function Counter({ rows, level }: { rows: StockOut[]; level: 'low' | 'out' }) {
  const { house } = useHouse()
  if (!rows.length) return null
  const item = rows.length === 1 ? house?.items.find((i) => i.id === rows[0].item_id) : undefined
  if (!item) {
    return (
      <span className="badge" data-level={level} title={t.levels[level]}>
        {rows.length}
      </span>
    )
  }
  const icon = iconOf(item, 'item')
  const label = `${t.levels[level]}: ${fullName(item)}`
  return (
    <span className="badge one" data-level={level} title={label} aria-label={label} role="img">
      {icon ? <IconArt name={icon} /> : item.name.charAt(0).toLocaleUpperCase('hu')}
    </span>
  )
}
