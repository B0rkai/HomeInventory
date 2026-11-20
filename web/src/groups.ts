import type { GroupOut, ItemOut } from './api'
import { iconOf } from './iconLookup'
import { hueOf, type Hue } from './icons'
import { t } from './strings'

// Item groups are data (the admin Csoportok tab): groups ("Élelmiszer"), each with a tile
// colour, and their subgroups ("Fűszer"), which wear their group's. An item without a
// chosen group takes its icon's: a subgroup listing the icon, else the group of its colour.

type Groupable = Pick<ItemOut, 'name' | 'icon' | 'group_id'>

/** The groups in list order. */
export function topGroups(groups: GroupOut[]): GroupOut[] {
  return groups.filter((group) => group.parent_id === null).sort(byPosition)
}

/** A group's subgroups in list order. */
export function subgroupsOf(groups: GroupOut[], id: number): GroupOut[] {
  return groups.filter((group) => group.parent_id === id).sort(byPosition)
}

function byPosition(a: GroupOut, b: GroupOut): number {
  return a.position - b.position || a.id - b.id
}

/** Groups and subgroups as lists show them: each group followed by its subgroups. */
export function groupOrder(groups: GroupOut[]): GroupOut[] {
  return topGroups(groups).flatMap((group) => [group, ...subgroupsOf(groups, group.id)])
}

/** The group or subgroup an item's icon suggests; none for a letter tile. */
export function autoGroup(item: Pick<ItemOut, 'name' | 'icon'>, groups: GroupOut[]) {
  const icon = iconOf(item, 'item')
  if (!icon) return undefined
  const ordered = groupOrder(groups)
  return (
    ordered.find((group) => group.parent_id !== null && group.icons.includes(icon)) ??
    ordered.find((group) => group.parent_id === null && group.hue === hueOf(icon, 'item'))
  )
}

/** The item's group or subgroup: the one chosen, else its icon's; none for "Egyéb". */
export function groupOf(item: Groupable, groups: GroupOut[]): GroupOut | undefined {
  if (item.group_id !== null) {
    const chosen = groups.find((group) => group.id === item.group_id)
    if (chosen) return chosen
  }
  return autoGroup(item, groups)
}

/** The group a subgroup belongs to; a group is its own. */
export function topOf(group: GroupOut, groups: GroupOut[]): GroupOut {
  return groups.find((other) => other.id === group.parent_id) ?? group
}

/** An item's tile colour: its group's, else its icon's. */
export function itemHue(item: Groupable, groups: GroupOut[]): Hue {
  const group = groupOf(item, groups)
  const hue = group && topOf(group, groups).hue
  return hue ?? hueOf(iconOf(item, 'item'), 'item')
}

/** "Fűszer", or "Egyéb" for none. */
export function groupName(group: GroupOut | undefined): string {
  return group ? group.name : t.items.noCategory
}

/** "Élelmiszer › Fűszer", or "Élelmiszer" for a group. */
export function groupPath(group: GroupOut | undefined, groups: GroupOut[]): string {
  if (!group) return t.items.noCategory
  const top = topOf(group, groups)
  return top === group ? group.name : `${top.name} › ${group.name}`
}

/** Some things under one group: those of each subgroup in use (`sub` none for those in the
 * group itself, which come first). */
export type GroupSection<T> = {
  group: GroupOut | undefined
  subs: { sub: GroupOut | undefined; list: T[] }[]
}

/**
 * Things sectioned by group, then subgroup, in list order, those in none ("Egyéb") last;
 * each list sorted with `sort`.
 */
export function sectionByGroup<T>(
  things: T[],
  itemOf: (thing: T) => Groupable,
  groups: GroupOut[],
  sort: (a: T, b: T) => number,
): GroupSection<T>[] {
  const byGroup = new Map<number | undefined, T[]>()
  for (const thing of things) {
    const id = groupOf(itemOf(thing), groups)?.id
    byGroup.set(id, [...(byGroup.get(id) ?? []), thing])
  }
  const sections: GroupSection<T>[] = []
  for (const group of topGroups(groups)) {
    const subs = [undefined, ...subgroupsOf(groups, group.id)]
      .map((sub) => ({ sub, list: (byGroup.get((sub ?? group).id) ?? []).sort(sort) }))
      .filter(({ list }) => list.length > 0)
    if (subs.length) sections.push({ group, subs })
  }
  const none = byGroup.get(undefined)
  if (none) sections.push({ group: undefined, subs: [{ sub: undefined, list: none.sort(sort) }] })
  return sections
}

/** Whether a section needs subgroup subheadings: things from more than one subgroup (or
 * the group itself and a subgroup). */
export function subheaded<T>(section: GroupSection<T>): boolean {
  return section.subs.length > 1
}
