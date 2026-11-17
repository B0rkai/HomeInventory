import { useState } from 'react'
import type { Category, ItemOut, Level } from './api'
import { CATEGORIES, categoryName, categoryOf, groupByCategory } from './categories'
import { useHouse } from './house'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { t } from './strings'
import { bestLevel } from './tree'
import { byItem, fullName } from './variants'

// The search and the group survive a visit to an item's page and back; the order is a
// preference, kept for good.
const SEARCH_KEY = 'items-search'
const GROUP_KEY = 'items-group'
const ORDER_KEY = 'items-order'

// A group tab: every group, one of them, or the items in none ("Egyéb").
type Tab = 'all' | Category | 'none'
// Most first (what's at home, say for cooking) or least first (what to buy).
type Order = 'most' | 'least'

const RANK: Record<Level, number> = { out: 0, low: 1, plenty: 2, lots: 3 }

function load(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function save(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value)
  } catch {
    // Only a convenience.
  }
}

/** Lower case without accents, so "kave" finds "Kávé". */
function fold(text: string): string {
  return text
    .toLocaleLowerCase('hu')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * The catalogue, each item with its best level anywhere, by level (most or least first)
 * and filtered by group and by a search; tap one for its page.
 */
export function ItemsPage() {
  const { house } = useHouse()
  const [search, setSearch] = useState(() => load(() => sessionStorage, SEARCH_KEY) ?? '')
  const [tab, setTab] = useState(() => (load(() => sessionStorage, GROUP_KEY) ?? 'all') as Tab)
  const [order, setOrder] = useState(() =>
    load(() => localStorage, ORDER_KEY) === 'least' ? 'least' : ('most' as Order),
  )
  if (!house) return null
  const { stock } = house

  const groupOf = (item: ItemOut): Tab => categoryOf(item) ?? 'none'
  // Only the groups that have items, in list order.
  const tabs: Tab[] = [
    'all',
    ...[...CATEGORIES, 'none' as const].filter((group) =>
      house.items.some((item) => groupOf(item) === group),
    ),
  ]
  // A group emptied since (its last item deleted or regrouped) falls back to all.
  const shown = tabs.includes(tab) ? tab : 'all'

  const levels = new Map(
    house.items.map((item) => [item.id, bestLevel(stock.filter((row) => row.item_id === item.id))]),
  )
  // Items kept nowhere come last either way: there's nothing to tell about them.
  const rank = (item: ItemOut) => {
    const level = levels.get(item.id)
    if (!level) return -Infinity
    return order === 'most' ? RANK[level] : -RANK[level]
  }
  const byLevel = (a: ItemOut, b: ItemOut) => rank(b) - rank(a) || byItem(a, b)

  const wanted = fold(search.trim())
  const items = house.items.filter(
    (item) => fold(fullName(item)).includes(wanted) && (shown === 'all' || groupOf(item) === shown),
  )

  function changeSearch(text: string) {
    setSearch(text)
    save(() => sessionStorage, SEARCH_KEY, text)
  }

  function changeTab(next: Tab) {
    setTab(next)
    save(() => sessionStorage, GROUP_KEY, next)
  }

  function flipOrder() {
    const next = order === 'most' ? 'least' : 'most'
    setOrder(next)
    save(() => localStorage, ORDER_KEY, next)
  }

  return (
    <>
      <h2>{t.items.title}</h2>
      <p className="muted">{t.items.hint}</p>
      {house.items.length > 0 && (
        <>
          <div className="filter-row">
            <input
              type="search"
              className="search"
              placeholder={t.items.search}
              aria-label={t.items.search}
              value={search}
              onChange={(event) => changeSearch(event.target.value)}
            />
            <button
              type="button"
              className="secondary small-button order-button"
              onClick={flipOrder}
              title={t.items.orderHint}
            >
              {order === 'most' ? t.items.mostFirst : t.items.leastFirst}
            </button>
          </div>
          <div className="group-tabs" role="tablist" aria-label={t.items.category}>
            {tabs.map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                className="chip"
                aria-selected={group === shown}
                onClick={() => changeTab(group)}
              >
                {group === 'all' ? t.items.all : categoryName(group === 'none' ? null : group)}
              </button>
            ))}
          </div>
        </>
      )}
      {items.length === 0 && (
        <div className="card">
          <p>{house.items.length ? t.items.noMatch : t.items.empty}</p>
        </div>
      )}
      {groupByCategory(items, byLevel).map(([category, groupItems]) => (
        <section key={category ?? ''} className="card">
          <h3>{categoryName(category)}</h3>
          <ul className="item-list">
            {groupItems.map((item) => {
              const level = levels.get(item.id)
              return (
                <li key={item.id}>
                  <a className="item-row" href={href.item(item.id)}>
                    <Named thing={item} kind="item" />
                    <span className="small">
                      {level && <LevelName level={level} />}
                      <span className="muted">
                        {level && ' · '}
                        {!item.restock && `${t.items.noRestock} · `}
                        {t.items.places(stock.filter((row) => row.item_id === item.id).length)}
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
