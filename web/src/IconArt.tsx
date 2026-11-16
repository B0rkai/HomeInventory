import { iconArt } from './iconLookup'

/** One line icon, drawn in the current text colour. */
export function IconArt({ name }: { name: string }) {
  return (
    <svg
      className="icon-art"
      viewBox="0 0 24 24"
      aria-hidden="true"
      // Our own constants, not user input.
      dangerouslySetInnerHTML={{ __html: iconArt(name) }}
    />
  )
}
