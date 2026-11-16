import { useSyncExternalStore } from 'react'

// Hash routes, so the Android back button walks the app's pages and a reload stays put.
export type MissingView = 'items' | 'places'

export type Route =
  | { page: 'home' }
  | { page: 'place'; id: number }
  | { page: 'items' }
  | { page: 'todo' }
  | { page: 'missing'; view: MissingView }

export const href = {
  home: '#/',
  place: (id: number) => `#/places/${id}`,
  items: '#/items',
  todo: '#/todo',
  missing: (view: MissingView = 'items') => (view === 'items' ? '#/missing' : '#/missing/places'),
}

function parse(hash: string): Route {
  const place = /^#\/places\/(\d+)$/.exec(hash)
  if (place) return { page: 'place', id: Number(place[1]) }
  if (hash === href.items) return { page: 'items' }
  if (hash === href.todo) return { page: 'todo' }
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
