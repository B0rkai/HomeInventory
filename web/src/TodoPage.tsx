import type { ReactNode } from 'react'
import type { ItemOut, RequestOut } from './api'
import { useHouse } from './house'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { t } from './strings'
import { ago } from './time'
import { placePath, treeOrder } from './tree'
import { PushSettings } from './PushSettings'
import { byItem, fullName } from './variants'

/**
 * What needs doing: the shopping list (items running low, one row per item however many
 * places want it, grouped by category for the shop) and the reported chores.
 */
export function TodoPage() {
  const { house } = useHouse()
  if (!house) return null
  const { locations, items, stock, chores, requests } = house
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const choresById = new Map(chores.map((chore) => [chore.id, chore]))
  const order = new Map(treeOrder(locations).map((location, index) => [location.id, index]))
  // The whole house's chores first.
  const rank = (id: number | null) => (id === null ? -1 : (order.get(id) ?? 0))
  const byPlace = (a: { location_id: number | null }, b: { location_id: number | null }) =>
    rank(a.location_id) - rank(b.location_id)

  // Buy requests by item, and items by category ("Egyéb" last).
  const buying = new Map<number, RequestOut[]>()
  for (const request of requests) {
    if (request.item_id === null || !itemsById.has(request.item_id)) continue
    buying.set(request.item_id, [...(buying.get(request.item_id) ?? []), request])
  }
  const categories = new Map<string, ItemOut[]>()
  for (const id of buying.keys()) {
    const item = itemsById.get(id)!
    const category = item.category ?? ''
    categories.set(category, [...(categories.get(category) ?? []), item])
  }
  const shopping = [...categories]
    .sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b, 'hu')))
    .map(([category, list]) => [category, list.sort(byItem)] as const)

  const choreRequests = requests
    .filter((request) => request.chore_id !== null && choresById.has(request.chore_id))
    .sort(byPlace)

  const placeLink = (id: number | null) =>
    id === null ? (
      <a href={href.home}>{t.home.wholeHouse}</a>
    ) : (
      <a href={href.place(id)}>{placePath(locations, id)}</a>
    )

  return (
    <>
      <h2>{t.todo.title}</h2>
      <PushSettings prompt />
      {buying.size === 0 && choreRequests.length === 0 && (
        <div className="card">
          <p>{t.todo.none}</p>
          <p className="muted">{t.todo.noneHint}</p>
        </div>
      )}

      {choreRequests.length > 0 && (
        <section className="card">
          <h3>{t.todo.chores}</h3>
          <ul className="requests">
            {choreRequests.map((request) => {
              const chore = choresById.get(request.chore_id!)!
              return (
                <RequestRow
                  key={request.id}
                  title={<Named thing={chore} kind="chore" />}
                  name={chore.name}
                  requests={[request]}
                  doneLabel={t.todo.done}
                >
                  <p className="small muted">
                    {placeLink(request.location_id)} ·{' '}
                    {request.created_by_name
                      ? t.todo.reported(request.created_by_name, ago(request.created_at))
                      : t.todo.due(ago(request.created_at))}
                  </p>
                </RequestRow>
              )
            })}
          </ul>
        </section>
      )}

      {shopping.length > 0 && (
        <section className="card">
          <h3>{t.todo.shopping}</h3>
          {shopping.map(([category, list]) => (
            <div key={category}>
              {/* Uncategorised items need no heading of their own. */}
              {(category || shopping.length > 1) && (
                <h4 className="category-head">{category || t.items.noCategory}</h4>
              )}
              <ul className="requests">
                {list.map((item) => {
                  const wanted = buying.get(item.id)!.sort(byPlace)
                  const wantedAt = new Set(wanted.map((request) => request.location_id))
                  const levels = new Map(
                    stock
                      .filter((row) => row.item_id === item.id)
                      .map((row) => [row.location_id, row.level]),
                  )
                  // Places that have lots of it, to fetch from instead.
                  const lots = stock
                    .filter(
                      (row) =>
                        row.item_id === item.id &&
                        row.level === 'lots' &&
                        !wantedAt.has(row.location_id),
                    )
                    .sort(byPlace)
                  return (
                    <RequestRow
                      key={item.id}
                      title={<Named thing={item} kind="item" />}
                      name={fullName(item)}
                      requests={wanted}
                      doneLabel={t.todo.bought}
                    >
                      <p className="small">
                        {wanted.map((request, index) => {
                          // A buy request always has a place.
                          const level = levels.get(request.location_id!)
                          return (
                            <span key={request.id}>
                              {index > 0 && ', '}
                              {placeLink(request.location_id)}
                              {level && (
                                <>
                                  {' '}
                                  <LevelName level={level} />
                                </>
                              )}
                            </span>
                          )
                        })}
                      </p>
                      {lots.length > 0 && (
                        <p className="small lots-note">
                          {t.missing.lotsAt}{' '}
                          {lots.map((row, index) => (
                            <span key={row.location_id}>
                              {index > 0 && ', '}
                              {placeLink(row.location_id)}
                            </span>
                          ))}
                        </p>
                      )}
                    </RequestRow>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

/**
 * One thing to buy or do, with who's on it and the buttons: claim, give back, done, not
 * needed. An item wanted in several places is one row; its buttons act on all of them.
 */
function RequestRow({
  title,
  name,
  requests,
  doneLabel,
  children,
}: {
  title: ReactNode
  name: string
  requests: RequestOut[]
  doneLabel: string
  children: ReactNode
}) {
  const { me, actions } = useHouse()
  const ids = (list: RequestOut[]) => list.map((request) => request.id)
  const open = requests.filter((request) => request.status === 'open')
  const mine = requests.filter((request) => request.claimed_by_id === me.id)
  const theirs = requests.find(
    (request) => request.status === 'claimed' && request.claimed_by_id !== me.id,
  )
  const who = mine.length
    ? t.todo.mine
    : theirs?.claimed_by_name && t.todo.theirs(theirs.claimed_by_name)

  return (
    <li>
      <div className="request-head">
        {title}
        <span className="request-who">
          {who && <span className={`claim ${mine.length ? 'mine' : ''}`}>{who}</span>}
          <button
            type="button"
            className="icon"
            aria-label={t.todo.cancel(name)}
            onClick={() => {
              if (window.confirm(t.todo.confirmCancel(name)))
                void actions.act('cancel', ids(requests))
            }}
          >
            ×
          </button>
        </span>
      </div>
      {/* Where and who, with the buttons beside it when it's short enough. */}
      <div className="request-body">
        <div className="request-info">{children}</div>
        <div className="request-actions">
          {open.length > 0 && (
            <button
              type="button"
              className="secondary small-button"
              onClick={() => actions.act('claim', ids(open))}
            >
              {t.todo.claim}
            </button>
          )}
          {open.length === 0 && mine.length > 0 && (
            <button
              type="button"
              className="secondary small-button"
              onClick={() => actions.act('unclaim', ids(mine))}
            >
              {t.todo.unclaim}
            </button>
          )}
          <button
            type="button"
            className="small-button"
            onClick={() => actions.act('done', ids(requests))}
          >
            ✓ {doneLabel}
          </button>
        </div>
      </div>
    </li>
  )
}
