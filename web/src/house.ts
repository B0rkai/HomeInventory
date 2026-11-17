import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelRequest,
  claimRequest,
  completeChore,
  completeRequest,
  createChore,
  createItem,
  remindRequest,
  createLocation,
  createRequest,
  deleteChore,
  deleteItem,
  deleteLocation,
  listChores,
  listItems,
  listLocations,
  listRequests,
  listStock,
  removeStock,
  requestStock,
  reportChore,
  setStock,
  unclaimRequest,
  updateChore,
  updateItem,
  updateLocation,
  type ChoreOut,
  type ChoreUpdate,
  type ItemCreate,
  type ItemOut,
  type ItemUpdate,
  type Level,
  type LocationOut,
  type LocationUpdate,
  type RequestOut,
  type StockOut,
  type UserOut,
} from './api'
import { t } from './strings'
import { fullName } from './variants'

export type House = {
  locations: LocationOut[]
  items: ItemOut[]
  stock: StockOut[]
  chores: ChoreOut[]
  // The open and claimed ones.
  requests: RequestOut[]
}

export type RequestAction = 'claim' | 'unclaim' | 'done' | 'cancel' | 'remind'

const REQUEST_ACTIONS = {
  claim: claimRequest,
  unclaim: unclaimRequest,
  done: completeRequest,
  cancel: cancelRequest,
  remind: remindRequest,
}

type Result<T> = Promise<{ data?: T; response?: Response }>

/** How long a change waits to be undone before it goes to the server. */
export const UNDO_DELAY = 6000

/**
 * A change held back for a few seconds so it can be undone: until it's sent, `show` makes
 * it look done, and nothing (no notification either) has reached the server.
 */
type Pending = {
  // Tells two changes with the same text apart.
  id: number
  label: string
  // Another change with the same key replaces it instead of sending it (a level picked twice).
  key?: string
  show: (house: House) => House
  send: () => Promise<unknown>
  // The same change as bare API calls, to keep when the page goes away (see `leave`).
  calls: Call[]
}

type Call = { method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: object }

const API = '/api/v1'

// Changes the page left behind when it went away, to send on the next start.
const LEFTOVERS_KEY = 'unsent-changes'
// Older than this, a change is stale: the house has moved on.
const LEFTOVERS_MAX_AGE_MS = 10 * 60_000

type Leftover = { at: number; calls: Call[] }

function readLeftovers(): Leftover[] {
  try {
    return JSON.parse(localStorage.getItem(LEFTOVERS_KEY) ?? '[]') as Leftover[]
  } catch {
    return []
  }
}

/** Sends what the last page left unsent, in order. A failure (someone else got there
 * first, say) is dropped quietly: it's no news to anyone now. */
async function sendLeftovers(): Promise<void> {
  const left = readLeftovers()
  if (!left.length) return
  try {
    localStorage.removeItem(LEFTOVERS_KEY)
  } catch {
    return
  }
  for (const { at, calls } of left) {
    if (Date.now() - at > LEFTOVERS_MAX_AGE_MS) continue
    for (const call of calls) {
      await fetch(API + call.path, {
        method: call.method,
        headers: call.body ? { 'Content-Type': 'application/json' } : undefined,
        body: call.body && JSON.stringify(call.body),
      }).catch(() => {})
    }
  }
}

const ACTIVE_STATUSES: RequestOut['status'][] = ['open', 'claimed']

let draftIds = 0
let serial = 0

/** What a failed change means to the user, by status; the rest get a generic message. */
type Messages = Partial<Record<number, string>>

export function useHouseState(me: UserOut, onError: (message: string) => void) {
  const [house, setHouse] = useState<House>()
  const [loadError, setLoadError] = useState<string>()
  // Changes not yet answered by the server, shown as done; the last may still be undone.
  const [pending, setPending] = useState<Pending[]>([])
  const [undoable, setUndoable] = useState<Pending>()
  const waiting = useRef<{ entry: Pending; timer: ReturnType<typeof setTimeout> }>(undefined)
  // The server's copy, for the actions to read without re-creating them on every change.
  const known = useRef<House>(undefined)
  useEffect(() => {
    known.current = house
  }, [house])

  const reload = useCallback(async () => {
    const [locations, items, stock, chores, requests] = await Promise.all([
      listLocations(),
      listItems(),
      listStock(),
      listChores(),
      listRequests(),
    ]).catch(() => [])
    if (locations?.data && items?.data && stock?.data && chores?.data && requests?.data) {
      setHouse({
        locations: locations.data,
        items: items.data,
        stock: stock.data,
        chores: chores.data,
        requests: requests.data,
      })
      setLoadError(undefined)
    } else {
      setLoadError(t.errors.unreachable)
    }
  }, [])

  // A stock level opens or closes buy requests on the server; fetch them again after one.
  const reloadRequests = useCallback(async () => {
    const { data } = await listRequests().catch(() => ({ data: undefined }))
    if (data) setHouse((h) => h && { ...h, requests: data })
  }, [])

  useEffect(() => {
    // The state is set once the fetch answers, not synchronously. What the last page left
    // unsent goes first, so the house loads with it.
    // oxlint-disable-next-line react/set-state-in-effect
    void sendLeftovers().finally(() => void reload())
  }, [reload])

  // Live updates: the server says when the house changed (and who changed it); the
  // other's changes are fetched again, ours are already here. A reconnect catches up.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let dropped = false
    const reloadSoon = () => {
      // Several changes in a row (a shopping row acts on each place) are one fetch.
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), 300)
    }
    const events = new EventSource('/api/v1/events')
    events.onmessage = (event) => {
      const { by } = JSON.parse(event.data as string) as { by: number | null }
      if (by !== me.id) reloadSoon()
    }
    events.onerror = () => {
      dropped = true
    }
    events.onopen = () => {
      if (dropped) reloadSoon()
      dropped = false
    }
    return () => {
      clearTimeout(timer)
      events.close()
    }
  }, [me.id, reload])

  // A phone may have slept through some events: catch up whenever the app comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  /** Runs a change; on failure tells the user and reloads, since our copy may be stale. */
  const change = useCallback(
    async <T>(request: Result<T>, messages: Messages = {}): Promise<{ data: T } | undefined> => {
      const { data, response } = await request.catch(() => ({
        data: undefined,
        response: undefined,
      }))
      // Wrapped, since a 204 has no data but is still a success.
      if (response?.ok) return { data: data as T }
      const status = response?.status
      onError(
        status === undefined
          ? t.errors.unreachable
          : (messages[status] ?? (status === 404 ? t.errors.notFound : t.errors.saveFailed)),
      )
      void reload()
      return undefined
    },
    [onError, reload],
  )

  /** Sends the change waiting to be undone, now; it keeps showing until the answer is in. */
  const flush = useCallback(() => {
    const held = waiting.current
    if (!held) return
    clearTimeout(held.timer)
    waiting.current = undefined
    setUndoable(undefined)
    void held.entry.send().finally(() => setPending((list) => list.filter((e) => e !== held.entry)))
  }, [])

  /**
   * The page is going away (reloaded, closed) with a change still waiting: it's kept on
   * the device and sent when the app next starts (`sendLeftovers`). A fetch started now is
   * dropped once a service worker controls the page, keepalive or not.
   */
  const leave = useCallback(() => {
    const held = waiting.current
    if (!held) return
    clearTimeout(held.timer)
    waiting.current = undefined
    try {
      const left = readLeftovers()
      left.push({ at: Date.now(), calls: held.entry.calls })
      localStorage.setItem(LEFTOVERS_KEY, JSON.stringify(left))
    } catch {
      // No storage: it's lost, as if undone.
    }
  }, [])

  const undo = useCallback(() => {
    const held = waiting.current
    if (!held) return
    clearTimeout(held.timer)
    waiting.current = undefined
    setUndoable(undefined)
    setPending((list) => list.filter((e) => e !== held.entry))
  }, [])

  /** Holds a change back to be undone; one waiting already goes now, unless this replaces it. */
  const defer = useCallback(
    (fields: Omit<Pending, 'id'>) => {
      const entry = { ...fields, id: ++serial }
      const held = waiting.current
      let replaced: Pending | undefined
      if (held && entry.key !== undefined && held.entry.key === entry.key) {
        clearTimeout(held.timer)
        replaced = held.entry
      } else {
        flush()
      }
      setPending((list) => [...list.filter((e) => e !== replaced), entry])
      waiting.current = { entry, timer: setTimeout(flush, UNDO_DELAY) }
      setUndoable(entry)
    },
    [flush],
  )

  // Switching away from the app sends what's waiting (the page lives on to take the
  // answer); the page going away keeps it for the next start.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', leave)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', leave)
      flush()
    }
  }, [flush, leave])

  /** A request as it will be once the server has it; stands in until then. */
  const draftRequest = useCallback(
    (fields: Pick<RequestOut, 'kind' | 'item_id' | 'chore_id' | 'location_id'>): RequestOut => ({
      ...fields,
      name: null,
      id: --draftIds,
      status: 'open',
      created_by_id: me.id,
      created_by_name: me.display_name,
      created_at: new Date().toISOString(),
      claimed_by_id: null,
      claimed_by_name: null,
      claimed_at: null,
      reminded_by_name: null,
      reminded_at: null,
    }),
    [me],
  )

  const send = useMemo(
    () => ({
      async addLocation(name: string, parentId: number | null) {
        const location = (
          await change(createLocation({ body: { name, parent_id: parentId } }), {
            409: t.errors.duplicateLocation,
            422: t.errors.tooDeep,
          })
        )?.data
        if (location) setHouse((h) => h && { ...h, locations: [...h.locations, location] })
        return location
      },
      async updateLocation(id: number, body: LocationUpdate) {
        const location = (
          await change(updateLocation({ path: { location_id: id }, body }), {
            409: t.errors.duplicateLocation,
          })
        )?.data
        // Moving renumbers the siblings too, so fetch them all.
        if (location) await reload()
        return location
      },
      async deleteLocation(id: number) {
        const ok = await change(deleteLocation({ path: { location_id: id } }))
        if (ok) {
          setHouse(
            (h) =>
              h && {
                ...h,
                locations: h.locations.filter((l) => l.id !== id),
                stock: h.stock.filter((s) => s.location_id !== id),
                chores: h.chores.filter((c) => c.location_id !== id),
                requests: h.requests.filter((r) => r.location_id !== id),
              },
          )
        }
        return Boolean(ok)
      },
      async addItem(body: ItemCreate) {
        const item = (
          await change(createItem({ body }), {
            409: t.errors.duplicateItem,
          })
        )?.data
        if (item) setHouse((h) => h && { ...h, items: [...h.items, item] })
        return item
      },
      async updateItem(id: number, body: ItemUpdate) {
        const item = (
          await change(updateItem({ path: { item_id: id }, body }), {
            409: t.errors.duplicateItem,
          })
        )?.data
        if (item) {
          setHouse((h) => h && { ...h, items: h.items.map((i) => (i.id === id ? item : i)) })
        }
        return item
      },
      async deleteItem(id: number) {
        const ok = await change(deleteItem({ path: { item_id: id } }))
        if (ok) {
          setHouse(
            (h) =>
              h && {
                ...h,
                items: h.items.filter((i) => i.id !== id),
                stock: h.stock.filter((s) => s.item_id !== id),
                requests: h.requests.filter((r) => r.item_id !== id),
              },
          )
        }
      },
      async setLevel(locationId: number, itemId: number, level: Level) {
        const row = (
          await change(
            setStock({ path: { location_id: locationId, item_id: itemId }, body: { level } }),
          )
        )?.data
        if (row) {
          setHouse(
            (h) =>
              h && {
                ...h,
                stock: [
                  ...h.stock.filter((s) => !(s.location_id === locationId && s.item_id === itemId)),
                  row,
                ],
              },
          )
          void reloadRequests()
        }
        return row
      },
      async removeStock(locationId: number, itemId: number) {
        const ok = await change(removeStock({ path: { location_id: locationId, item_id: itemId } }))
        if (ok) {
          setHouse(
            (h) =>
              h && {
                ...h,
                stock: h.stock.filter(
                  (s) => !(s.location_id === locationId && s.item_id === itemId),
                ),
              },
          )
          void reloadRequests()
        }
      },
      /** Puts an item kept somewhere on the shopping list, whatever its level. */
      async requestStock(locationId: number, itemId: number) {
        const request = (
          await change(requestStock({ path: { location_id: locationId, item_id: itemId } }))
        )?.data
        if (request) {
          setHouse(
            (h) =>
              h && { ...h, requests: [...h.requests.filter((r) => r.id !== request.id), request] },
          )
        }
      },
      /** Writes something on the shopping list that isn't kept track of. */
      async addToList(name: string) {
        const request = (await change(createRequest({ body: { name } })))?.data
        if (request) setHouse((h) => h && { ...h, requests: [...h.requests, request] })
        return request
      },
      /** A place's (or the house's) lasting chore, or a one-off to-do, reported at once. */
      async addChore(locationId: number | null, name: string, oneOff = false) {
        const chore = (
          await change(createChore({ body: { location_id: locationId, name, one_off: oneOff } }), {
            409: t.errors.duplicateChore,
          })
        )?.data
        if (chore) {
          setHouse((h) => h && { ...h, chores: [...h.chores, chore] })
          if (oneOff) await reloadRequests()
        }
        return chore
      },
      async updateChore(id: number, body: ChoreUpdate) {
        const chore = (
          await change(updateChore({ path: { chore_id: id }, body }), {
            409: t.errors.duplicateChore,
          })
        )?.data
        if (chore) {
          setHouse((h) => h && { ...h, chores: h.chores.map((c) => (c.id === id ? chore : c)) })
        }
        return chore
      },
      async deleteChore(id: number) {
        const ok = await change(deleteChore({ path: { chore_id: id } }))
        if (ok) {
          setHouse(
            (h) =>
              h && {
                ...h,
                chores: h.chores.filter((c) => c.id !== id),
                requests: h.requests.filter((r) => r.chore_id !== id),
              },
          )
        }
      },
      async reportChore(id: number) {
        const request = (await change(reportChore({ path: { chore_id: id } })))?.data
        if (request) {
          setHouse(
            (h) =>
              h && { ...h, requests: [...h.requests.filter((r) => r.id !== request.id), request] },
          )
        }
      },
      /** Records a chore as done now, reported or not. */
      async completeChore(id: number) {
        const chore = (await change(completeChore({ path: { chore_id: id } })))?.data
        if (chore) {
          setHouse(
            (h) =>
              h && {
                ...h,
                chores: h.chores.map((c) => (c.id === id ? chore : c)),
                requests: h.requests.filter((r) => r.chore_id !== id),
              },
          )
        }
      },
      /** Claims, unclaims, completes or cancels requests (an item's, in every place). */
      async act(action: RequestAction, ids: number[]) {
        const results = await Promise.all(
          ids.map((id) =>
            change(REQUEST_ACTIONS[action]({ path: { request_id: id } }), {
              409: action === 'remind' ? t.errors.remindedToday : t.errors.requestChanged,
            }),
          ),
        )
        if (action === 'done') {
          // Done refills the stock too.
          await reload()
          return
        }
        const changed = new Map(results.flatMap((r) => (r ? [[r.data.id, r.data]] : [])))
        setHouse(
          (h) =>
            h && {
              ...h,
              requests: h.requests
                .map((r) => changed.get(r.id) ?? r)
                .filter((r) => r.status === 'open' || r.status === 'claimed'),
            },
        )
      },
    }),
    [change, reload, reloadRequests],
  )

  const actions = useMemo(() => {
    const itemName = (id: number | null) => {
      const item = known.current?.items.find((i) => i.id === id)
      return item ? fullName(item) : ''
    }
    const choreName = (id: number | null) =>
      known.current?.chores.find((c) => c.id === id)?.name ?? ''
    const stockKey = (locationId: number, itemId: number) => `stock:${locationId}:${itemId}`
    const withoutStock = (h: House, locationId: number, itemId: number) =>
      h.stock.filter((s) => !(s.location_id === locationId && s.item_id === itemId))
    const activeAt = (h: House, locationId: number, itemId: number) =>
      h.requests.find(
        (r) =>
          r.item_id === itemId &&
          r.location_id === locationId &&
          ACTIVE_STATUSES.includes(r.status),
      )

    return {
      ...send,
      /** Shows a message the way a failed change does. */
      notify: onError,
      undo,
      /** Adds an item to a place: sent at once, there is nothing to undo yet. */
      addStock: send.setLevel,
      /** Sets a level, undoable for a moment; picking another first replaces it. */
      setLevel(locationId: number, itemId: number, level: Level) {
        const key = stockKey(locationId, itemId)
        const current = known.current?.stock.find(
          (s) => s.location_id === locationId && s.item_id === itemId,
        )
        // Picking back the level the server has is undoing it.
        if (waiting.current?.entry.key === key && current?.level === level) {
          undo()
          return
        }
        const item = known.current?.items.find((i) => i.id === itemId)
        defer({
          key,
          label: t.undo.level(t.levels[level], itemName(itemId)),
          show: (h) => {
            const short = level === 'low' || level === 'out'
            const active = activeAt(h, locationId, itemId)
            let requests = h.requests
            if (short && item?.restock && !active) {
              requests = [
                ...requests,
                draftRequest({
                  kind: 'buy',
                  item_id: itemId,
                  chore_id: null,
                  location_id: locationId,
                }),
              ]
            } else if (!short && active) {
              requests = requests.filter((r) => r !== active)
            }
            return {
              ...h,
              requests,
              stock: [
                ...withoutStock(h, locationId, itemId),
                {
                  item_id: itemId,
                  location_id: locationId,
                  level,
                  updated_by_name: me.display_name,
                  updated_at: new Date().toISOString(),
                },
              ],
            }
          },
          send: () => send.setLevel(locationId, itemId, level),
          calls: [
            { method: 'PUT', path: `/locations/${locationId}/stock/${itemId}`, body: { level } },
          ],
        })
      },
      removeStock(locationId: number, itemId: number) {
        defer({
          label: t.undo.removed(itemName(itemId)),
          show: (h) => ({
            ...h,
            stock: withoutStock(h, locationId, itemId),
            requests: h.requests.filter(
              (r) => !(r.item_id === itemId && r.location_id === locationId),
            ),
          }),
          send: () => send.removeStock(locationId, itemId),
          calls: [{ method: 'DELETE', path: `/locations/${locationId}/stock/${itemId}` }],
        })
      },
      requestStock(locationId: number, itemId: number) {
        defer({
          label: t.undo.listed(itemName(itemId)),
          show: (h) =>
            activeAt(h, locationId, itemId)
              ? h
              : {
                  ...h,
                  requests: [
                    ...h.requests,
                    draftRequest({
                      kind: 'buy',
                      item_id: itemId,
                      chore_id: null,
                      location_id: locationId,
                    }),
                  ],
                },
          send: () => send.requestStock(locationId, itemId),
          calls: [{ method: 'POST', path: `/locations/${locationId}/stock/${itemId}/request` }],
        })
      },
      reportChore(id: number) {
        const chore = known.current?.chores.find((c) => c.id === id)
        defer({
          label: t.undo.reported(choreName(id)),
          show: (h) =>
            h.requests.some((r) => r.chore_id === id && ACTIVE_STATUSES.includes(r.status))
              ? h
              : {
                  ...h,
                  requests: [
                    ...h.requests,
                    draftRequest({
                      kind: 'chore',
                      item_id: null,
                      chore_id: id,
                      location_id: chore?.location_id ?? null,
                    }),
                  ],
                },
          send: () => send.reportChore(id),
          calls: [{ method: 'POST', path: `/chores/${id}/requests` }],
        })
      },
      completeChore(id: number) {
        defer({
          label: t.undo.choreDone(choreName(id)),
          show: (h) => ({
            ...h,
            chores: h.chores.map((c) =>
              c.id === id
                ? {
                    ...c,
                    last_done_at: new Date().toISOString(),
                    last_done_by_name: me.display_name,
                  }
                : c,
            ),
            requests: h.requests.filter((r) => r.chore_id !== id),
          }),
          send: () => send.completeChore(id),
          calls: [{ method: 'POST', path: `/chores/${id}/done` }],
        })
      },
      /** Claims, unclaims, completes, cancels or asks after requests, undoable for a moment. */
      act(action: RequestAction, all: number[]) {
        // A request still on its way has no id yet to act on.
        const ids = all.filter((id) => id > 0)
        if (!ids.length) return
        const targets = known.current?.requests.filter((r) => ids.includes(r.id)) ?? []
        const names = [
          ...new Set(
            targets.map(
              (r) => r.name ?? (r.item_id !== null ? itemName(r.item_id) : choreName(r.chore_id)),
            ),
          ),
        ]
        const what = names.length <= 2 ? names.join(', ') : t.undo.things(names.length)
        const now = new Date().toISOString()
        defer({
          label: t.undo[action](what),
          show: (h) => ({
            ...h,
            requests: h.requests.flatMap((r) => {
              if (!ids.includes(r.id)) return [r]
              if (action === 'done' || action === 'cancel') return []
              if (action === 'claim') {
                return [
                  {
                    ...r,
                    status: 'claimed' as const,
                    claimed_by_id: me.id,
                    claimed_by_name: me.display_name,
                    claimed_at: now,
                  },
                ]
              }
              if (action === 'unclaim') {
                return [
                  { ...r, status: 'open' as const, claimed_by_id: null, claimed_by_name: null },
                ]
              }
              return [{ ...r, reminded_by_name: me.display_name, reminded_at: now }]
            }),
          }),
          send: () => send.act(action, ids),
          calls: ids.map((id) => ({ method: 'POST', path: `/requests/${id}/${action}` })),
        })
      },
    }
  }, [send, onError, undo, defer, draftRequest, me])

  // What the pages see: the server's copy with the changes still on their way.
  const shown = useMemo(
    () => (house ? pending.reduce((h, entry) => entry.show(h), house) : house),
    [house, pending],
  )

  return { me, house: shown, loadError, reload, actions, undoable }
}

type HouseContext = ReturnType<typeof useHouseState>

export const HouseContext = createContext<HouseContext | null>(null)

export function useHouse(): HouseContext {
  const value = useContext(HouseContext)
  if (!value) throw new Error('useHouse outside HouseProvider')
  return value
}
