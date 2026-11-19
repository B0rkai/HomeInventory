import type { ItemOut, Level, LocationOut, StockOut } from './api'
import { groupKey, interchangeable } from './variants'

// Floor -> room -> spot; the server's limit too.
export const MAX_DEPTH = 3

export function childrenOf(locations: LocationOut[], parentId: number | null): LocationOut[] {
  return locations
    .filter((location) => location.parent_id === parentId)
    .sort((a, b) => a.position - b.position || a.id - b.id)
}

/** The location and its ancestors, floor first. */
export function pathTo(locations: LocationOut[], id: number): LocationOut[] {
  const byId = new Map(locations.map((location) => [location.id, location]))
  const path: LocationOut[] = []
  for (let location = byId.get(id); location; location = byId.get(location.parent_id ?? NaN)) {
    path.unshift(location)
  }
  return path
}

/** "Földszint › Konyha › Spájz". */
export function placePath(locations: LocationOut[], id: number): string {
  return pathTo(locations, id)
    .map((location) => location.name)
    .join(' › ')
}

export function subtreeIds(locations: LocationOut[], id: number): Set<number> {
  const ids = new Set([id])
  // Parents come before children only by accident, so repeat until nothing is added.
  for (let grew = true; grew;) {
    grew = false
    for (const location of locations) {
      if (location.parent_id !== null && ids.has(location.parent_id) && !ids.has(location.id)) {
        ids.add(location.id)
        grew = true
      }
    }
  }
  return ids
}

/** What runs low or out in a location: the stock rows, by level. */
export type Shortage = { low: StockOut[]; out: StockOut[] }

/**
 * What runs low or out in a location: with `deep`, including the places inside it (for a
 * chip that stands for them all); without, only what's kept there itself (for a floor
 * whose rooms show their own).
 */
export function shortageIn(
  locations: LocationOut[],
  stock: StockOut[],
  id: number,
  { deep = true } = {},
): Shortage {
  const ids = deep ? subtreeIds(locations, id) : new Set([id])
  const shortage: Shortage = { low: [], out: [] }
  for (const row of stock) {
    if (ids.has(row.location_id) && (row.level === 'low' || row.level === 'out')) {
      shortage[row.level].push(row)
    }
  }
  return shortage
}

export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'hu')
}

/**
 * The stock rows whose running low is a shortage: of items kept stocked, and where any
 * variant (or any of a family) will do, only once every one kept in that place is short.
 */
export function restockedStock(stock: StockOut[], items: ItemOut[]): StockOut[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  // Where some variant (or family member) of an item isn't short: "group|place".
  const covered = new Set(
    stock.flatMap((row) => {
      const item = byId.get(row.item_id)
      return item && interchangeable(item) && !isShort(row)
        ? [`${groupKey(item)}|${row.location_id}`]
        : []
    }),
  )
  return stock.filter((row) => {
    const item = byId.get(row.item_id)
    return (
      item?.restock &&
      !(interchangeable(item) && covered.has(`${groupKey(item)}|${row.location_id}`))
    )
  })
}

// Emptiest first, as the level buttons run.
const LEVEL_ORDER: Level[] = ['out', 'low', 'plenty', 'lots']

/** The highest level among some stock rows (an item's across places); none for none. */
export function bestLevel(rows: { level: Level }[]): Level | undefined {
  let best: Level | undefined
  for (const { level } of rows) {
    if (!best || LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(best)) best = level
  }
  return best
}

export function isShort(row: StockOut): boolean {
  return row.level === 'low' || row.level === 'out'
}

/** Every location in tree order: each floor, then what's inside it, by position. */
export function treeOrder(locations: LocationOut[]): LocationOut[] {
  const ordered: LocationOut[] = []
  const visit = (parentId: number | null) => {
    for (const location of childrenOf(locations, parentId)) {
      ordered.push(location)
      visit(location.id)
    }
  }
  visit(null)
  return ordered
}
