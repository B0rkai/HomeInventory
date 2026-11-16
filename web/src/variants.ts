import type { ItemOut } from './api'

// Items sharing a name are kinds of one supply ("Konzerv" + "kukorica"); the UI shows them
// as one group with the variants under it.

const SEPARATOR = ' · '
const fold = (text: string) => text.toLocaleLowerCase('hu')

/** "Konzerv · kukorica", or just the name. */
export function fullName(item: { name: string; variant: string | null }): string {
  return item.variant ? `${item.name}${SEPARATOR}${item.variant}` : item.name
}

/** Reads back what fullName wrote (e.g. a picked suggestion); a plain name has no variant. */
export function parseFullName(text: string): { name: string; variant: string | null } {
  const [name, ...rest] = text.split(SEPARATOR)
  return { name: name.trim(), variant: rest.join(SEPARATOR).trim() || null }
}

export function findItem(items: ItemOut[], name: string, variant: string | null) {
  return items.find(
    (item) => fold(item.name) === fold(name) && fold(item.variant ?? '') === fold(variant ?? ''),
  )
}

/** By name, then variant, the one without a variant first. */
export function byItem(a: ItemOut, b: ItemOut): number {
  return (
    a.name.localeCompare(b.name, 'hu') || (a.variant ?? '').localeCompare(b.variant ?? '', 'hu')
  )
}

export type Group<T> = { name: string; first: ItemOut; rows: T[] }

/** Rows grouped by their item's name, in name order; rows keep their order within a group. */
export function groupByName<T>(rows: T[], itemOf: (row: T) => ItemOut): Group<T>[] {
  const groups = new Map<string, Group<T>>()
  for (const row of rows) {
    const item = itemOf(row)
    const group = groups.get(fold(item.name))
    if (group) group.rows.push(row)
    else groups.set(fold(item.name), { name: item.name, first: item, rows: [row] })
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'hu'))
}

/**
 * Whether a group shows its variants apart, not as one plain item: it has more than one
 * item, or its only one has a variant. Rows of one item in several places don't count.
 */
export function hasVariants<T>(group: Group<T>, itemOf: (row: T) => ItemOut): boolean {
  const items = new Set(group.rows.map((row) => itemOf(row).id))
  return items.size > 1 || itemOf(group.rows[0]).variant !== null
}
