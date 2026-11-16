import { HouseContext, useHouseState } from './house'

/** Loads the locations, items and stock once, for every page. */
export function HouseProvider({
  onError,
  children,
}: {
  onError: (message: string) => void
  children: React.ReactNode
}) {
  return <HouseContext value={useHouseState(onError)}>{children}</HouseContext>
}
