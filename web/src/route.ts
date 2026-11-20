import { useSyncExternalStore } from 'react'

// Hash routes, so the Android back button walks the app's pages and a reload stays put.
// The pool of open requests, or the ones I've claimed.
export type TodoView = 'open' | 'mine'
// The admin pages' tabs.
export type AdminView =
  'items' | 'groups' | 'places' | 'todo' | 'cookings' | 'recipes' | 'log' | 'people'
const ADMIN_VIEWS: AdminView[] = [
  'items',
  'groups',
  'places',
  'todo',
  'cookings',
  'recipes',
  'log',
  'people',
]
// The Menu tab: the planned cookings, or the recipes.
export type MenuView = 'week' | 'recipes'

export type Route =
  | { page: 'home' }
  | { page: 'place'; id: number }
  | { page: 'items' }
  | { page: 'item'; id: number }
  | { page: 'todo'; view: TodoView }
  | { page: 'menu'; view: MenuView }
  // Planning a cooking: picking the recipe, then (with its id) the day.
  | { page: 'plan'; recipeId?: number }
  // A planned cooking; `left`: what's left after cooking it.
  | { page: 'cooking'; id: number; left: boolean }
  // A recipe's page; `edit` its editor; no id: a new one.
  | { page: 'recipe'; id: number }
  | { page: 'recipeEdit'; id?: number }
  | { page: 'log' }
  | { page: 'admin'; view: AdminView }

export const href = {
  home: '#/',
  place: (id: number) => `#/places/${id}`,
  items: '#/items',
  item: (id: number) => `#/items/${id}`,
  todo: (view: TodoView = 'open') => (view === 'open' ? '#/todo' : '#/todo/mine'),
  log: '#/log',
  admin: (view: AdminView = 'items') => (view === 'items' ? '#/admin' : `#/admin/${view}`),
  menu: '#/menu',
  recipes: '#/menu/recipes',
  plan: (recipeId?: number) => (recipeId === undefined ? '#/plan' : `#/plan/${recipeId}`),
  cooking: (id: number) => `#/cookings/${id}`,
  cookingDone: (id: number) => `#/cookings/${id}/done`,
  recipe: (id: number) => `#/recipes/${id}`,
  recipeEdit: (id?: number) => (id === undefined ? '#/recipes/new' : `#/recipes/${id}/edit`),
}

function parse(hash: string): Route {
  const place = /^#\/places\/(\d+)$/.exec(hash)
  if (place) return { page: 'place', id: Number(place[1]) }
  if (hash === href.items) return { page: 'items' }
  const item = /^#\/items\/(\d+)$/.exec(hash)
  if (item) return { page: 'item', id: Number(item[1]) }
  if (hash === href.todo('open')) return { page: 'todo', view: 'open' }
  if (hash === href.todo('mine')) return { page: 'todo', view: 'mine' }
  // The shortages page went into the catalogue ("Csak hiány").
  if (hash.startsWith('#/missing')) return { page: 'items' }
  if (hash === href.menu) return { page: 'menu', view: 'week' }
  if (hash === href.recipes) return { page: 'menu', view: 'recipes' }
  if (hash === href.plan()) return { page: 'plan' }
  const plan = /^#\/plan\/(\d+)$/.exec(hash)
  if (plan) return { page: 'plan', recipeId: Number(plan[1]) }
  const cooking = /^#\/cookings\/(\d+)(\/done)?$/.exec(hash)
  if (cooking) return { page: 'cooking', id: Number(cooking[1]), left: Boolean(cooking[2]) }
  if (hash === href.recipeEdit()) return { page: 'recipeEdit' }
  const recipe = /^#\/recipes\/(\d+)(\/edit)?$/.exec(hash)
  if (recipe) {
    const id = Number(recipe[1])
    return recipe[2] ? { page: 'recipeEdit', id } : { page: 'recipe', id }
  }
  if (hash === href.log) return { page: 'log' }
  if (hash === href.admin()) return { page: 'admin', view: 'items' }
  const admin = /^#\/admin\/(\w+)$/.exec(hash)
  if (admin && ADMIN_VIEWS.includes(admin[1] as AdminView)) {
    return { page: 'admin', view: admin[1] as AdminView }
  }
  return { page: 'home' }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parse(hash)
}
