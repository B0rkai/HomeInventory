import type { Category, ItemOut } from './api'
import { iconOf } from './iconLookup'
import { hueOf } from './icons'
import { t } from './strings'

// Item groups are a fixed set, one per icon colour (icons.ts): food, drink, cleaning,
// hygiene, household. An item without a chosen group takes its icon's.

/** In the order lists show them; "Egyéb" (no group) comes after. */
export const CATEGORIES: Category[] = ['food', 'drink', 'clean', 'body', 'home']

/** The group an item's icon suggests; null for a letter tile. */
export function iconCategory(item: Pick<ItemOut, 'name' | 'icon'>): Category | null {
  const icon = iconOf(item, 'item')
  if (!icon) return null
  const hue = hueOf(icon, 'item')
  return hue === 'place' ? null : hue
}

/** The item's group: the one chosen, else its icon's; null when neither says. */
export function categoryOf(item: ItemOut): Category | null {
  return item.category ?? iconCategory(item)
}

export function categoryName(category: Category | null): string {
  return category ? t.categories[category] : t.items.noCategory
}

/** Items grouped by category, in list order, each group sorted with `sort`. */
export function groupByCategory(
  items: ItemOut[],
  sort: (a: ItemOut, b: ItemOut) => number,
): [Category | null, ItemOut[]][] {
  const groups = new Map<Category | null, ItemOut[]>()
  for (const item of items) {
    const category = categoryOf(item)
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  return [...CATEGORIES, null]
    .filter((category) => groups.has(category))
    .map((category) => [category, groups.get(category)!.sort(sort)])
}
