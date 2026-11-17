import { categoryName, groupByCategory } from './categories'
import { useHouse } from './house'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { t } from './strings'
import { bestLevel } from './tree'
import { byItem } from './variants'

/** The catalogue by group, each item with its best level anywhere; tap one for its page. */
export function ItemsPage() {
  const { house } = useHouse()
  if (!house) return null
  const { items, stock } = house

  return (
    <>
      <h2>{t.items.title}</h2>
      <p className="muted">{t.items.hint}</p>
      {items.length === 0 && (
        <div className="card">
          <p>{t.items.empty}</p>
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
