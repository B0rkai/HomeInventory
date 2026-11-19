import type { ItemOut } from './api'

// Items sharing a name are kinds of one supply ("Konzerv" + "kukorica"); the UI shows them
// as one group with the variants under it. A family ("Pékáru": Kenyér, Zsemle, Kifli) is a
// group of items any of which will do, each item's own; where any variant of an item will
// do, its variants are a family named after it ("Konzerv").

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

/** An item name's first variant in list order: where its name links to. */
export function firstVariant(items: ItemOut[], name: string): ItemOut | undefined {
  return items.filter((item) => fold(item.name) === fold(name)).sort(byItem)[0]
}

/** Whether others will do instead of it: its family's members. */
export function interchangeable(item: ItemOut): boolean {
  return item.family != null
}

/** The same for the items that will do instead of each other, and only for them. */
export function groupKey(item: ItemOut): string {
  return item.family != null ? `family:${fold(item.family)}` : `item:${item.id}`
}

/** Whether a family's members are all kinds of one item ("Konzerv"): named by their
 * variant, not their whole name. */
export function oneName(members: ItemOut[]): boolean {
  return new Set(members.map((member) => fold(member.name))).size === 1
}

/** What will do instead of the item, itself included, in list order. */
export function groupMembers(item: ItemOut, items: ItemOut[]): ItemOut[] {
  const key = groupKey(item)
  return items.filter((other) => groupKey(other) === key).sort(byItem)
}

/** A family's members as the list names them: an item by its name when every variant of
 * it is in ("Zsemle"), else each variant in by its whole name ("Kenyér · fehér"). */
export function memberNames(members: ItemOut[], items: ItemOut[]): string[] {
  const names: string[] = []
  for (const member of [...members].sort(byItem)) {
    const whole = items
      .filter((item) => fold(item.name) === fold(member.name))
      .every((item) => members.some((other) => other.id === item.id))
    const name = whole ? member.name : fullName(member)
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/** The families in the catalogue, each once, in order. */
export function familyNames(items: ItemOut[]): string[] {
  const names = new Map<string, string>()
  for (const item of items) if (item.family) names.set(fold(item.family), item.family)
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'hu'))
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
