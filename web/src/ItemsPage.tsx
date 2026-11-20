import { useState } from 'react'
import type { ItemOut, Level } from './api'
import {
  groupName,
  groupOf,
  sectionByGroup,
  subgroupsOf,
  subheaded,
  topGroups,
  topOf,
} from './groups'
import { reservations, reservedText } from './cookings'
import { useHouse } from './house'
import { IconArt } from './IconArt'
import { LevelName } from './LevelPicker'
import { Named, ReservedMark } from './Named'
import { href } from './route'
import { t } from './strings'
import { bestLevel, isShort, restockedStock, treeOrder } from './tree'
import { byItem, fullName } from './variants'

// The search and the group survive a visit to an item's page and back; the order is a
// preference, kept for good.
const SEARCH_KEY = 'items-search'
const GROUP_KEY = 'items-group'
const SUB_KEY = 'items-subgroup'
const ORDER_KEY = 'items-order'
const SHORT_KEY = 'items-short'

// A group tab: every group, one of them (its id), or the items in none ("Egyéb"). A
// subgroup chip: all of the group, the items in the group itself, or a subgroup's id.
type Tab = string
const ALL = 'all'
const NONE = 'none'
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
 * and filtered by group and by a search; tap one for its page. "Csak hiány" keeps what's
 * low or out somewhere (and kept stocked), with where, and where there's lots to fetch.
 */
export function ItemsPage() {
  const { house } = useHouse()
  const [search, setSearch] = useState(() => load(() => sessionStorage, SEARCH_KEY) ?? '')
  const [tab, setTab] = useState<Tab>(() => load(() => sessionStorage, GROUP_KEY) ?? ALL)
  const [subTab, setSubTab] = useState<Tab>(() => load(() => sessionStorage, SUB_KEY) ?? ALL)
  const [order, setOrder] = useState(() =>
    load(() => localStorage, ORDER_KEY) === 'least' ? 'least' : ('most' as Order),
  )
  const [shortOnly, setShortOnly] = useState(() => load(() => sessionStorage, SHORT_KEY) === '1')
  if (!house) return null
  const { stock, locations } = house
  // Only what's kept stocked: no ice cream isn't a shortage.
  const placeOrder = new Map(treeOrder(locations).map((location, index) => [location.id, index]))
  const short = restockedStock(stock, house.items)
    .filter(isShort)
    .sort((a, b) => (placeOrder.get(a.location_id) ?? 0) - (placeOrder.get(b.location_id) ?? 0))
  const placeName = (id: number) => locations.find((l) => l.id === id)?.name ?? ''
  // What planned cookings need.
  const reserved = reservations(house)

  const { groups } = house
  // An item's group tab, and its subgroup chip (the group's own id for one in the group
  // itself).
  const tabOf = (item: ItemOut): Tab => {
    const own = groupOf(item, groups)
    return own ? String(topOf(own, groups).id) : NONE
  }
  const subTabOf = (item: ItemOut): Tab => String(groupOf(item, groups)?.id)
  // Only the groups that have items, in list order.
  const tabs: Tab[] = [
    ALL,
    ...[...topGroups(groups).map((group) => String(group.id)), NONE].filter((group) =>
      house.items.some((item) => tabOf(item) === group),
    ),
  ]
  // A group emptied since (its last item deleted or regrouped) falls back to all.
  const shown = tabs.includes(tab) ? tab : ALL
  // The chosen group's subgroups in use, those in the group itself first: chips only when
  // there are two kinds or more.
  const inShown = house.items.filter((item) => tabOf(item) === shown)
  const subTabs =
    shown === ALL || shown === NONE
      ? []
      : [shown, ...subgroupsOf(groups, Number(shown)).map((sub) => String(sub.id))].filter((sub) =>
          inShown.some((item) => subTabOf(item) === sub),
        )
  const subShown = subTabs.length > 1 && subTabs.includes(subTab) ? subTab : ALL

  const levels = new Map(
    house.items.map((item) => [item.id, bestLevel(stock.filter((row) => row.item_id === item.id))]),
  )
  // Items kept nowhere come last either way: there's nothing to tell about them.
  const rank = (item: ItemOut) => {
    // Short: out first, whatever the order.
    if (shortOnly)
      return short.some((row) => row.item_id === item.id && row.level === 'out') ? 1 : 0
    const level = levels.get(item.id)
    if (!level) return -Infinity
    return order === 'most' ? RANK[level] : -RANK[level]
  }
  const byLevel = (a: ItemOut, b: ItemOut) => rank(b) - rank(a) || byItem(a, b)

  const wanted = fold(search.trim())
  const items = house.items.filter(
    (item) =>
      fold(fullName(item)).includes(wanted) &&
      (shown === ALL || tabOf(item) === shown) &&
      (subShown === ALL || subTabOf(item) === subShown) &&
      (!shortOnly || short.some((row) => row.item_id === item.id)),
  )

  function changeSearch(text: string) {
    setSearch(text)
    save(() => sessionStorage, SEARCH_KEY, text)
  }

  function changeTab(next: Tab) {
    setTab(next)
    save(() => sessionStorage, GROUP_KEY, next)
    changeSubTab(ALL)
  }

  function changeSubTab(next: Tab) {
    setSubTab(next)
    save(() => sessionStorage, SUB_KEY, next)
  }

  function flipShort() {
    setShortOnly(!shortOnly)
    save(() => sessionStorage, SHORT_KEY, shortOnly ? '0' : '1')
  }

  function flipOrder() {
    const next = order === 'most' ? 'least' : 'most'
    setOrder(next)
    save(() => localStorage, ORDER_KEY, next)
  }

  return (
    <>
      <h2>{t.items.title}</h2>
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
              aria-pressed={shortOnly}
              onClick={flipShort}
            >
              {t.items.shortOnly}
            </button>
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
                {group === ALL
                  ? t.items.all
                  : groupName(groups.find((g) => String(g.id) === group))}
              </button>
            ))}
          </div>
          {subTabs.length > 1 && (
            <div className="group-tabs sub-tabs" role="tablist" aria-label={t.items.subgroup}>
              {[ALL, ...subTabs].map((sub) => (
                <button
                  key={sub}
                  type="button"
                  role="tab"
                  className="chip"
                  aria-selected={sub === subShown}
                  onClick={() => changeSubTab(sub)}
                >
                  {sub === ALL
                    ? t.items.all
                    : sub === shown
                      ? t.items.groupItself
                      : groupName(groups.find((g) => String(g.id) === sub))}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {items.length === 0 && (
        <div className="card">
          <p>
            {!house.items.length
              ? t.items.empty
              : shortOnly && !wanted && shown === ALL
                ? t.items.noShortage
                : t.items.noMatch}
          </p>
        </div>
      )}
      {sectionByGroup(items, (item) => item, groups, byLevel).map((section) => (
        <section key={section.group?.id ?? ''} className="card">
          <h3>{groupName(section.group)}</h3>
          {section.subs.map(({ sub, list }) => (
            <div key={sub?.id ?? ''} className="subgroup">
              {subheaded(section) && (
                <h4 className="subgroup-head">{sub ? sub.name : t.items.groupItself}</h4>
              )}
              <ul className="item-list">
                {list.map((item) => {
                  const shortRows = short.filter((row) => row.item_id === item.id)
                  // Short: the worst level, and where; else the best, and in how many places.
                  const level = shortOnly
                    ? shortRows.some((row) => row.level === 'out')
                      ? 'out'
                      : 'low'
                    : levels.get(item.id)
                  const lots = stock.filter(
                    (row) => row.item_id === item.id && row.level === 'lots',
                  )
                  return (
                    <li key={item.id}>
                      <a className="item-row" href={href.item(item.id)}>
                        <Named thing={item} kind="item" />
                        <span className="small">
                          {!item.restock && (
                            <span className="no-restock" role="img" aria-label={t.items.noRestock}>
                              <IconArt name="repeat-off" />
                            </span>
                          )}
                          {reserved.has(item.id) && (
                            <ReservedMark text={reservedText(house, reserved.get(item.id)!)} />
                          )}
                          {level && <LevelName level={level} />}
                          <span className="muted">
                            {level && ' · '}
                            {shortOnly
                              ? shortRows.map((row) => placeName(row.location_id)).join(', ')
                              : t.items.places(
                                  stock.filter((row) => row.item_id === item.id).length,
                                )}
                            {shortOnly &&
                              lots.length > 0 &&
                              ` · ${t.items.lotsAt(lots.map((row) => placeName(row.location_id)).join(', '))}`}
                          </span>
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </>
  )
}
