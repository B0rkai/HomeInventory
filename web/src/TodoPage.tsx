import { type ReactNode, useState } from 'react'
import type { Category, ItemOut, RequestOut } from './api'
import { cookingName } from './cookings'
import { dayFor } from './days'
import { type House, useHouse } from './house'
import { IconArt } from './IconArt'
import { LevelName } from './LevelPicker'
import { Named } from './Named'
import { href, type TodoView } from './route'
import { t } from './strings'
import { ago, isToday } from './time'
import { bestLevel, placePath, treeOrder } from './tree'
import { KeepForm } from './KeepForm'
import { OneOffForm } from './OneOffForm'
import { PushSettings } from './PushSettings'
import { iconOf } from './iconLookup'
import { byItem, fullName, groupMembers, interchangeable, memberNames, oneName } from './variants'
import { categoryName, groupByCategory } from './categories'

/**
 * What needs doing, in two lists: the pool (open requests nobody has taken yet, then what
 * the other has taken) and mine (what I've claimed).
 */
export function TodoPage({ view }: { view: TodoView }) {
  const { me, house } = useHouse()
  if (!house) return null
  const pool = house.requests.filter((request) => request.status === 'open')
  const mine = house.requests.filter((request) => request.claimed_by_id === me.id)
  const theirs = house.requests.filter(
    (request) => request.status === 'claimed' && request.claimed_by_id !== me.id,
  )
  const counts = { open: pool.length, mine: mine.length }
  // Usually one other person; their name heads what they've taken.
  const otherNames = [...new Set(theirs.map((request) => request.claimed_by_name ?? ''))]

  return (
    <>
      <h2>{t.todo.title}</h2>
      <div className="tabs" role="tablist">
        {(['open', 'mine'] as const).map((tab) => (
          <a
            key={tab}
            role="tab"
            aria-selected={view === tab}
            href={href.todo(tab)}
            onClick={(event) => {
              // Switching views shouldn't add to the back button's history.
              event.preventDefault()
              window.location.replace(href.todo(tab))
            }}
          >
            {tab === 'open' ? t.todo.pool : t.todo.mineTab}
            {counts[tab] > 0 && <span className="tab-badge">{counts[tab]}</span>}
          </a>
        ))}
      </div>
      <PushSettings prompt />
      {view === 'open' ? (
        <>
          <OneOffForm />
          {pool.length === 0 && (
            <div className="card">
              <p>{theirs.length || mine.length ? t.todo.poolEmpty : t.todo.none}</p>
              {!theirs.length && !mine.length && <p className="muted">{t.todo.noneHint}</p>}
            </div>
          )}
          <Sections requests={pool} />
          {theirs.length > 0 && (
            <>
              <h2 className="sub-title">{t.todo.theirsTitle(otherNames.join(', '))}</h2>
              <Sections requests={theirs} />
            </>
          )}
        </>
      ) : (
        <>
          {mine.length === 0 && (
            <div className="card">
              <p>{t.todo.mineEmpty}</p>
            </div>
          )}
          <Sections requests={mine} />
        </>
      )}
    </>
  )
}

/**
 * Some requests as the chores, the refills (items running low where another place has
 * lots: fetch, don't buy) and the shopping list (the rest, grouped by category for the
 * shop). An item is one row however many of the places that want it are listed.
 */
function Sections({ requests }: { requests: RequestOut[] }) {
  const { house, actions } = useHouse()
  if (!house) return null
  const { locations, items, stock, chores } = house
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const choresById = new Map(chores.map((chore) => [chore.id, chore]))
  const order = new Map(treeOrder(locations).map((location, index) => [location.id, index]))
  // The whole house's chores first.
  const rank = (id: number | null) => (id === null ? -1 : (order.get(id) ?? 0))
  const byPlace = (a: { location_id: number | null }, b: { location_id: number | null }) =>
    rank(a.location_id) - rank(b.location_id)

  // Where any variant (or any of a family) will do, they're one row, under the first one's
  // id, shown without a variant (or as the family).
  const variantsOf = new Map<number, ItemOut[]>()
  const rowKey = (itemId: number) => {
    const item = itemsById.get(itemId)!
    if (!interchangeable(item)) return itemId
    const group = groupMembers(item, items)
    variantsOf.set(group[0].id, group)
    return group[0].id
  }
  const idsOf = (key: number) => (variantsOf.get(key) ?? [{ id: key }]).map((i) => i.id)

  // Buy requests by item. One written on the list by hand has no item: it stands in as one
  // of its own, under its request's id made negative (it has no stock and no page).
  const buying = new Map<number, RequestOut[]>()
  for (const request of requests) {
    if (request.name !== null) {
      itemsById.set(-request.id, {
        id: -request.id,
        name: request.name,
        variant: null,
        category: null,
        icon: null,
        restock: false,
        any_variant: false,
        family: null,
        substitute_ids: [],
      })
      buying.set(-request.id, [request])
      continue
    }
    if (request.item_id === null || !itemsById.has(request.item_id)) continue
    const key = rowKey(request.item_id)
    buying.set(key, [...(buying.get(key) ?? []), request])
  }
  // Where another place has lots of it: fetch from there instead of buying. Places that
  // want it themselves don't count, whichever list they're on.
  const lotsFor = (key: number) => {
    const ids = idsOf(key)
    const wantedAt = new Set(
      house.requests
        .filter((request) => request.item_id !== null && ids.includes(request.item_id))
        .map((request) => request.location_id),
    )
    return stock
      .filter(
        (row) =>
          ids.includes(row.item_id) && row.level === 'lots' && !wantedAt.has(row.location_id),
      )
      .sort(byPlace)
  }
  const refills: ItemOut[] = []
  // The rest is the shopping list, by category.
  const toBuy: ItemOut[] = []
  for (const id of buying.keys()) {
    const first = itemsById.get(id)!
    // Shown as the supply, not one kind of it; or as the family, its icon guessed from its
    // name, else its first member's (so it's grouped with them).
    const item = !variantsOf.has(id)
      ? first
      : first.family
        ? {
            ...first,
            name: first.family,
            variant: null,
            icon: iconOf({ name: first.family, icon: null }, 'item') ? null : iconOf(first, 'item'),
          }
        : { ...first, variant: null }
    if (lotsFor(id).length) {
      refills.push(item)
      continue
    }
    toBuy.push(item)
  }
  refills.sort(byItem)
  const shopping = groupByCategory(toBuy, byItem)
  // A list of only uncategorised items needs no group headings.
  const headed = shopping.length > 1 || shopping[0]?.[0] != null

  const choreRequests = requests
    .filter((request) => request.chore_id !== null && choresById.has(request.chore_id))
    .sort(byPlace)

  // Whoever's off to the shop takes a whole group at once.
  const claimAll = (list: ItemOut[]) => {
    const open = list.flatMap((item) =>
      buying.get(item.id)!.filter((request) => request.status === 'open'),
    )
    // One item has its own button.
    if (new Set(open.map((request) => request.item_id)).size < 2) return null
    return (
      <button
        type="button"
        className="secondary small-button"
        onClick={() =>
          actions.act(
            'claim',
            open.map((request) => request.id),
          )
        }
      >
        {t.todo.claimAll}
      </button>
    )
  }

  const placeLink = (id: number | null) =>
    id === null ? (
      <a href={href.home}>{t.home.wholeHouse}</a>
    ) : (
      <a href={href.place(id)}>{placePath(locations, id)}</a>
    )

  /** An item wanted in one or more places, and (for a refill) where to bring it from. */
  const itemRow = (item: ItemOut) => {
    const wanted = buying.get(item.id)!.sort(byPlace)
    const lots = lotsFor(item.id)
    const ids = idsOf(item.id)
    const variants = variantsOf.get(item.id)
    // Per place; where any variant will do, the best of them (all short, or it wouldn't be
    // listed).
    const levelAt = (locationId: number) =>
      bestLevel(stock.filter((row) => ids.includes(row.item_id) && row.location_id === locationId))
    const named = (
      <Named
        thing={item}
        kind="item"
        note={
          variants &&
          (oneName(variants)
            ? t.items.anyKind
            : t.items.anyOf(memberNames(variants, items).join(', ')))
        }
      />
    )
    return (
      <RequestRow
        key={item.id}
        title={
          item.id > 0 ? (
            <a className="item-link" href={href.item(item.id)}>
              {named}
            </a>
          ) : (
            named
          )
        }
        name={fullName(item)}
        requests={wanted}
        doneLabel={lots.length ? t.todo.refilled : t.todo.bought}
        // Written on the list by hand: once bought, it can go into the inventory.
        keep={item.id < 0 ? wanted[0] : undefined}
        // Any of several variants will do: done asks which was bought.
        variants={variants && variants.length > 1 ? variants : undefined}
      >
        {item.id > 0 && wanted.some((request) => request.location_id !== null) && (
          <p className="small">
            {wanted
              // Bought for a cooking, kept nowhere: no place to tell.
              .filter((request) => request.location_id !== null)
              .map((request, index) => {
                const level = levelAt(request.location_id!)
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
        )}
        <CookingNote requests={wanted} />
        {item.id < 0 && wanted[0].created_by_name && (
          <p className="small muted">
            {t.todo.written(wanted[0].created_by_name, ago(wanted[0].created_at))}
          </p>
        )}
        {lots.length > 0 && (
          <p className="small lots-note">
            {t.todo.fetchFrom}{' '}
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
  }

  return (
    <>
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

      {refills.length > 0 && (
        <section className="card">
          <h3>{t.todo.refill}</h3>
          <ul className="requests">{refills.map(itemRow)}</ul>
        </section>
      )}

      {shopping.length > 0 && (
        <section className="card">
          <div className="section-head">
            <h3>{t.todo.shopping}</h3>
            <span className="head-actions">
              {/* A list of only uncategorised items has no group heading to put it on. */}
              {!headed && claimAll(toBuy)}
              <ShareButton text={shoppingText(shopping, buying, house, headed)} />
            </span>
          </div>
          {shopping.map(([category, list]) => (
            <div key={category ?? ''}>
              {headed && (
                <div className="section-head category-head">
                  <h4>{categoryName(category)}</h4>
                  {claimAll(list)}
                </div>
              )}
              <ul className="requests">{list.map(itemRow)}</ul>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

/** The shopping list as plain text, by group, each item with the places that want it. */
function shoppingText(
  shopping: [Category | null, ItemOut[]][],
  buying: Map<number, RequestOut[]>,
  house: House,
  headed: boolean,
): string {
  const lines = [t.todo.shopping]
  for (const [category, list] of shopping) {
    lines.push('')
    if (headed) lines.push(categoryName(category))
    for (const item of list) {
      const requests = buying.get(item.id)!
      const why = [
        ...requests
          .filter((request) => request.location_id !== null)
          .map((request) => placePath(house.locations, request.location_id!)),
        ...forCookings(house, requests),
      ]
      lines.push(why.length ? `- ${fullName(item)} (${why.join(', ')})` : `- ${fullName(item)}`)
    }
  }
  return lines.join('\n')
}

/** The cookings some lines are due for: "Palacsinta, szombatra". */
function forCookings(house: House, requests: RequestOut[]): string[] {
  const ids = [...new Set(requests.map((request) => request.cooking_id))]
  return ids
    .map((id) => house.cookings.find((cooking) => cooking.id === id))
    .filter((cooking) => cooking !== undefined)
    .map((cooking) => t.menu.forCooking(cookingName(house, cooking), dayFor(cooking.day)))
}

/** Which cooking a line is due for, with a chef's hat; a link to it. */
function CookingNote({ requests }: { requests: RequestOut[] }) {
  const { house } = useHouse()
  if (!house) return null
  const cookings = [...new Set(requests.map((request) => request.cooking_id))]
    .map((id) => house.cookings.find((cooking) => cooking.id === id))
    .filter((cooking) => cooking !== undefined)
  if (!cookings.length) return null
  return (
    <p className="small cooking-note">
      <IconArt name="chef-hat" />
      {cookings.map((cooking, index) => (
        <span key={cooking.id}>
          {index > 0 && '; '}
          <a href={href.cooking(cooking.id)}>
            {t.menu.forCooking(cookingName(house, cooking), dayFor(cooking.day))}
          </a>
        </span>
      ))}
    </p>
  )
}

/** Hands the text to the phone's share sheet, or copies it where there is none. */
function ShareButton({ text }: { text: string }) {
  const { actions } = useHouse()
  async function share() {
    if (navigator.share) {
      // Cancelling the share sheet rejects; nothing to tell.
      await navigator.share({ text }).catch(() => {})
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      actions.notify(t.todo.copied)
    } catch {
      actions.notify(t.todo.copyFailed)
    }
  }
  return (
    <button type="button" className="secondary small-button" onClick={() => void share()}>
      {t.todo.share}
    </button>
  )
}

/**
 * One thing to buy or do, with its buttons: claim, give back, done, not needed. Who's on
 * it shows from the list it's in. An item wanted in several places is one row; its
 * buttons act on all of them.
 */
function RequestRow({
  title,
  name,
  requests,
  doneLabel,
  keep,
  variants,
  children,
}: {
  title: ReactNode
  name: string
  requests: RequestOut[]
  doneLabel: string
  // A line written on the list, which can be bought into the inventory.
  keep?: RequestOut
  // Where any of these variants will do: done asks which one was bought.
  variants?: ItemOut[]
  children: ReactNode
}) {
  const { me, actions } = useHouse()
  const [keeping, setKeeping] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const ids = (list: RequestOut[]) => list.map((request) => request.id)
  const open = requests.filter((request) => request.status === 'open')
  const mine = requests.filter((request) => request.claimed_by_id === me.id)
  // Claimed by the other: they can be asked, once a day, when it'll be done.
  const theirs = requests.filter(
    (request) => request.status === 'claimed' && request.claimed_by_id !== me.id,
  )
  const lastReminder = (list: RequestOut[]) =>
    list
      .filter((request) => request.reminded_at)
      .sort((a, b) => b.reminded_at!.localeCompare(a.reminded_at!))[0]
  const askedMe = lastReminder(mine)
  const asked = lastReminder(theirs)
  const askedToday = asked && isToday(asked.reminded_at!)
  return (
    <li>
      <div className="request-head">
        {title}
        <span className="request-who">
          <button
            type="button"
            className="icon"
            aria-label={t.todo.cancel(name)}
            // Undoable, so no need to ask first.
            onClick={() => actions.act('cancel', ids(requests))}
          >
            ×
          </button>
        </span>
      </div>
      {/* Where and who, with the buttons beside it when it's short enough. */}
      <div className="request-body">
        <div className="request-info">
          {children}
          {askedMe && (
            <p className="small claim">
              {t.todo.remindedMe(askedMe.reminded_by_name ?? '', ago(askedMe.reminded_at!))}
            </p>
          )}
          {askedToday && (
            <p className="small muted">{t.todo.remindedByMe(ago(asked.reminded_at!))}</p>
          )}
        </div>
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
          {!open.length && !mine.length && theirs.length > 0 && !askedToday && (
            <button
              type="button"
              className="secondary small-button"
              title={t.todo.remindHint(theirs[0].claimed_by_name ?? '')}
              // One nudge per row: the item's other places would only repeat it.
              onClick={() => actions.act('remind', [theirs[0].id])}
            >
              🔔 {t.todo.remind}
            </button>
          )}
          {keep && !keeping && (
            <button
              type="button"
              className="secondary small-button"
              title={t.todo.keepHint}
              onClick={() => setKeeping(true)}
            >
              {t.todo.keep}
            </button>
          )}
          <button
            type="button"
            className="small-button"
            onClick={() => (variants ? setChoosing(!choosing) : actions.act('done', ids(requests)))}
          >
            ✓ {doneLabel}
          </button>
        </div>
      </div>
      {variants && choosing && (
        <div className="which-bought">
          <span className="small muted">{t.items.whichBought}</span>
          <div className="chips">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className="chip"
                onClick={() => {
                  setChoosing(false)
                  actions.act('done', ids(requests), variant.id)
                }}
              >
                {/* A family of several names: its members by their whole name. */}
                {oneName(variants) ? (variant.variant ?? t.items.noVariant) : fullName(variant)}
              </button>
            ))}
          </div>
        </div>
      )}
      {keep && keeping && <KeepForm request={keep} onClose={() => setKeeping(false)} />}
    </li>
  )
}
