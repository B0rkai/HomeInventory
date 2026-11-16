import { useSyncExternalStore } from 'react'

// Hash routes, so the Android back button walks the app's pages and a reload stays put.
export type Route = { page: 'home' } | { page: 'place'; id: number } | { page: 'items' }

export const href = {
  home: '#/',
  place: (id: number) => `#/places/${id}`,
  items: '#/items',
}

function parse(hash: string): Route {
  const place = /^#\/places\/(\d+)$/.exec(hash)
  if (place) return { page: 'place', id: Number(place[1]) }
  if (hash === href.items) return { page: 'items' }
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
