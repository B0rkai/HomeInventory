import type { CookingOut, IngredientOut, ItemOut, Level, RecipeOut, RequestOut } from './api'
import { dayFor } from './days'
import type { House } from './house'
import { flatIngredients, ingredientItems, ingredientLevel, standIn } from './recipes'
import { t } from './strings'

/** What a cooking (or one being planned) is made of. */
export type Plan = Pick<CookingOut, 'recipe_id' | 'side_id' | 'bought_item_ids'>

/**
 * An ingredient of a cooking and how it stands: at home (or something to use instead),
 * bought for it, on the list, or lacking with no line (taken off by hand). Optional ones
 * are only "if there's some".
 */
export type Need = {
  ingredient: IngredientOut
  items: ItemOut[]
  state: 'home' | 'instead' | 'bought' | 'listed' | 'missing' | 'optional'
  level?: Level
  instead?: { item: ItemOut; level: Level }
  line?: RequestOut
}

export function recipeOf(house: House, id: number | null): RecipeOut | undefined {
  return house.recipes.find((recipe) => recipe.id === id)
}

/** The recipe's name, with the side dish: "Rántott hús + Rizs". */
export function cookingName(house: House, plan: Pick<Plan, 'recipe_id' | 'side_id'>): string {
  const recipe = recipeOf(house, plan.recipe_id)
  const side = recipeOf(house, plan.side_id)
  return [recipe?.name ?? '', side?.name].filter(Boolean).join(' + ')
}

/** Whether a side dish can go with the recipe: a main course, or a menu with a main course
 * and no side dish of its own. */
export function takesSide(recipe: RecipeOut, recipes: RecipeOut[]): boolean {
  if (recipe.kind === 'main') return true
  if (recipe.kind !== 'menu') return false
  const parts = recipe.ingredients
    .map((ingredient) => recipes.find((r) => r.id === ingredient.part_id))
    .filter((part) => part !== undefined)
  return parts.some((part) => part.kind === 'main') && !parts.some((part) => part.kind === 'side')
}

/** Everything the cooking takes, its side dish's too, each once (as the server counts). */
export function cookingNeeds(house: House, plan: Plan): Need[] {
  const { items, stock, recipes, requests } = house
  const all = new Map<string, IngredientOut>()
  for (const id of [plan.recipe_id, plan.side_id]) {
    const recipe = recipeOf(house, id)
    if (!recipe) continue
    for (const ingredient of flatIngredients(recipe, recipes)) {
      const key = `${ingredient.item_id}:${ingredient.any_variant}`
      const before = all.get(key)
      if (!before || (before.optional && !ingredient.optional)) all.set(key, ingredient)
    }
  }
  return [...all.values()].map((ingredient): Need => {
    const own = ingredientItems(ingredient, items)
    const ids = own.map((item) => item.id)
    const level = ingredientLevel(ingredient, items, stock)
    const need = { ingredient, items: own, level }
    if (ingredient.optional) return { ...need, state: 'optional' }
    if (level === 'plenty' || level === 'lots') return { ...need, state: 'home' }
    const instead = standIn(ingredient, items, stock)
    if (instead) return { ...need, state: 'instead', instead }
    if ((plan.bought_item_ids ?? []).some((id) => ids.includes(id)))
      return { ...need, state: 'bought' }
    const line = requests.find(
      (request) => request.item_id !== null && ids.includes(request.item_id),
    )
    return line ? { ...need, state: 'listed', line } : { ...need, state: 'missing' }
  })
}

const LACKING: Need['state'][] = ['listed', 'missing']

/** The cooking in one line: everything's there, or how many are lacking. */
export function cookingStatus(needs: Need[]): { text: string; tone: 'ok' | 'low' | 'out' } {
  const unlisted = needs.filter((need) => need.state === 'missing')
  if (unlisted.length)
    return { text: t.menu.notListed(unlisted.map(needName).join(', ')), tone: 'out' }
  const lacking = needs.filter((need) => LACKING.includes(need.state)).length
  return lacking
    ? { text: t.menu.missingListed(lacking), tone: 'low' }
    : { text: t.menu.allThere, tone: 'ok' }
}

/** An ingredient's name as the cooking shows it. */
export function needName(need: Need): string {
  const [first] = need.items
  if (!first) return ''
  return need.ingredient.any_variant || !first.variant
    ? first.name
    : `${first.name} · ${first.variant}`
}

/** What each item is needed for: the planned cookings lacking or using it, by item id. */
export function reservations(house: House): Map<number, CookingOut[]> {
  const out = new Map<number, CookingOut[]>()
  for (const cooking of house.cookings) {
    for (const need of cookingNeeds(house, cooking)) {
      if (need.state === 'optional') continue
      for (const item of need.items) out.set(item.id, [...(out.get(item.id) ?? []), cooking])
    }
  }
  return out
}

/** "Lecsó, szombatra; Pörkölt, holnapra": the cookings an item is reserved for. */
export function reservedText(house: House, cookings: CookingOut[]): string {
  return t.menu.reserved(
    cookings
      .map((cooking) => t.menu.forCooking(cookingName(house, cooking), dayFor(cooking.day)))
      .join('; '),
  )
}
