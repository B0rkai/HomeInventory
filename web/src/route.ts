import { useSyncExternalStore } from 'react'

// Hash routes, so the Android back button walks the app's pages and a reload stays put.
export type MissingView = 'items' | 'places'
// The pool of open requests, or the ones I've claimed.
export type TodoView = 'open' | 'mine'

export type Route =
  | { page: 'home' }
  | { page: 'place'; id: number }
  | { page: 'items' }
  | { page: 'item'; id: number }
  | { page: 'todo'; view: TodoView }
  | { page: 'missing'; view: MissingView }

export const href = {
  home: '#/',
  place: (id: number) => `#/places/${id}`,
  items: '#/items',
  item: (id: number) => `#/items/${id}`,
  todo: (view: TodoView = 'open') => (view === 'open' ? '#/todo' : '#/todo/mine'),
  missing: (view: MissingView = 'items') => (view === 'items' ? '#/missing' : '#/missing/places'),
}

function parse(hash: string): Route {
  const place = /^#\/places\/(\d+)$/.exec(hash)
  if (place) return { page: 'place', id: Number(place[1]) }
  if (hash === href.items) return { page: 'items' }
  const item = /^#\/items\/(\d+)$/.exec(hash)
  if (item) return { page: 'item', id: Number(item[1]) }
  if (hash === href.todo('open')) return { page: 'todo', view: 'open' }
  if (hash === href.todo('mine')) return { page: 'todo', view: 'mine' }
  if (hash === href.missing('items')) return { page: 'missing', view: 'items' }
  if (hash === href.missing('places')) return { page: 'missing', view: 'places' }
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
