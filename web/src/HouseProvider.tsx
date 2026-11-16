import type { UserOut } from './api'
import { HouseContext, useHouseState } from './house'

/** Loads the house (places, items, stock, chores, requests) once, for every page. */
export function HouseProvider({
  me,
  onError,
  children,
}: {
  // The user of this device, to tell their claims from the other's.
  me: UserOut
  onError: (message: string) => void
  children: React.ReactNode
}) {
  return <HouseContext value={useHouseState(me, onError)}>{children}</HouseContext>
}
