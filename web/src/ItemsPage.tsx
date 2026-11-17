import { useState } from 'react'
import { categoryName, groupByCategory } from './categories'
import { useHouse } from './house'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { t } from './strings'
import { bestLevel } from './tree'
import { byItem, fullName } from './variants'

// The search survives a visit to an item's page and back.
const SEARCH_KEY = 'items-search'

function savedSearch(): string {
  try {
    return sessionStorage.getItem(SEARCH_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Lower case without accents, so "kave" finds "Kávé". */
function fold(text: string): string {
  return text
    .toLocaleLowerCase('hu')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** The catalogue by group, each item with its best level anywhere; tap one for its page. */
export function ItemsPage() {
  const { house } = useHouse()
  const [search, setSearch] = useState(savedSearch)
  if (!house) return null
  const { stock } = house
  const wanted = fold(search.trim())
  const items = house.items.filter((item) => fold(fullName(item)).includes(wanted))

  function changeSearch(text: string) {
    setSearch(text)
    try {
      sessionStorage.setItem(SEARCH_KEY, text)
    } catch {
      // Only a convenience.
    }
  }

  return (
    <>
      <h2>{t.items.title}</h2>
      <p className="muted">{t.items.hint}</p>
      {house.items.length > 0 && (
        <input
          type="search"
          className="search"
          placeholder={t.items.search}
          aria-label={t.items.search}
          value={search}
          onChange={(event) => changeSearch(event.target.value)}
        />
      )}
      {items.length === 0 && (
        <div className="card">
          <p>{house.items.length ? t.items.noMatch : t.items.empty}</p>
        </div>
      )}
      {groupByCategory(items, byItem).map(([category, groupItems]) => (
        <section key={category ?? ''} className="card">
          <h3>{categoryName(category)}</h3>
          <ul className="item-list">
            {groupItems.map((item) => {
              const rows = stock.filter((row) => row.item_id === item.id)
              const level = bestLevel(rows)
              return (
                <li key={item.id}>
                  <a className="item-row" href={href.item(item.id)}>
                    <Named thing={item} kind="item" />
                    <span className="small">
                      {level && <LevelName level={level} />}
                      <span className="muted">
                        {level && ' · '}
                        {!item.restock && `${t.items.noRestock} · `}
                        {t.items.places(rows.length)}
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
