import type { ItemOut, LocationOut, StockOut } from './api'

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

function subtreeIds(locations: LocationOut[], id: number): Set<number> {
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

/** The stock rows of items kept stocked: only their running low is a shortage. */
export function restockedStock(stock: StockOut[], items: ItemOut[]): StockOut[] {
  const restocked = new Set(items.filter((item) => item.restock).map((item) => item.id))
  return stock.filter((row) => restocked.has(row.item_id))
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
