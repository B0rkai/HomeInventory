import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  createItem,
  createLocation,
  deleteItem,
  deleteLocation,
  listItems,
  listLocations,
  listStock,
  removeStock,
  setStock,
  updateItem,
  updateLocation,
  type ItemOut,
  type ItemUpdate,
  type Level,
  type LocationOut,
  type LocationUpdate,
  type StockOut,
} from './api'
import { t } from './strings'

export type House = { locations: LocationOut[]; items: ItemOut[]; stock: StockOut[] }

type Result<T> = Promise<{ data?: T; response?: Response }>

/** What a failed change means to the user, by status; the rest get a generic message. */
type Messages = Partial<Record<number, string>>

export function useHouseState(onError: (message: string) => void) {
  const [house, setHouse] = useState<House>()
  const [loadError, setLoadError] = useState<string>()

  const reload = useCallback(async () => {
    const [locations, items, stock] = await Promise.all([
      listLocations(),
      listItems(),
      listStock(),
    ]).catch(() => [])
    if (locations?.data && items?.data && stock?.data) {
      setHouse({ locations: locations.data, items: items.data, stock: stock.data })
      setLoadError(undefined)
    } else {
      setLoadError(t.errors.unreachable)
    }
  }, [])

  useEffect(() => {
    // The state is set once the fetch answers, not synchronously.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
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
              },
          )
        }
        return Boolean(ok)
      },
      async addItem(name: string) {
        const item = (
          await change(createItem({ body: { name } }), {
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
        }
      },
    }),
    [change, reload],
  )

  return { house, loadError, reload, actions }
}

type HouseContext = ReturnType<typeof useHouseState>

export const HouseContext = createContext<HouseContext | null>(null)

export function useHouse(): HouseContext {
  const value = useContext(HouseContext)
  if (!value) throw new Error('useHouse outside HouseProvider')
  return value
}
