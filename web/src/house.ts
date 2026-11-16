import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  cancelRequest,
  claimRequest,
  completeChore,
  completeRequest,
  createChore,
  createItem,
  createLocation,
  deleteChore,
  deleteItem,
  deleteLocation,
  listChores,
  listItems,
  listLocations,
  listRequests,
  listStock,
  removeStock,
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

export type House = {
  locations: LocationOut[]
  items: ItemOut[]
  stock: StockOut[]
  chores: ChoreOut[]
  // The open and claimed ones.
  requests: RequestOut[]
}

export type RequestAction = 'claim' | 'unclaim' | 'done' | 'cancel'

const REQUEST_ACTIONS = {
  claim: claimRequest,
  unclaim: unclaimRequest,
  done: completeRequest,
  cancel: cancelRequest,
}

type Result<T> = Promise<{ data?: T; response?: Response }>

/** What a failed change means to the user, by status; the rest get a generic message. */
type Messages = Partial<Record<number, string>>

export function useHouseState(me: UserOut, onError: (message: string) => void) {
  const [house, setHouse] = useState<House>()
  const [loadError, setLoadError] = useState<string>()

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
    // The state is set once the fetch answers, not synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  // Until live updates arrive (milestone 4), catch up on the other's changes whenever the
  // app comes back to the screen, e.g. when the phone is unlocked.
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

  const actions = useMemo(
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
      async addChore(locationId: number, name: string) {
        const chore = (
          await change(createChore({ body: { location_id: locationId, name } }), {
            409: t.errors.duplicateChore,
          })
        )?.data
        if (chore) setHouse((h) => h && { ...h, chores: [...h.chores, chore] })
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
              409: t.errors.requestChanged,
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

  return { me, house, loadError, reload, actions }
}

type HouseContext = ReturnType<typeof useHouseState>

export const HouseContext = createContext<HouseContext | null>(null)

export function useHouse(): HouseContext {
  const value = useContext(HouseContext)
  if (!value) throw new Error('useHouse outside HouseProvider')
  return value
}
