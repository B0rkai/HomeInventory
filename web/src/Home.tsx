import { useState } from 'react'
import { AddForm } from './AddForm'
import { useHouse } from './house'
import { Named } from './Named'
import { href } from './route'
import { ShortageBadge } from './ShortageBadge'
import { t } from './strings'
import { childrenOf, shortageIn } from './tree'

/** Every floor with its rooms, so any place is one tap away. */
export function Home() {
  const { house, actions } = useHouse()
  // Starts in edit mode while the house is empty, so the first floors go in one by one.
  const [editing, setEditing] = useState(() => !house?.locations.length)
  if (!house) return null
  const { locations, stock } = house
  const floors = childrenOf(locations, null)

  return (
    <>
      <div className="title-row">
        <h2>{t.home.title}</h2>
        <button type="button" className="secondary" onClick={() => setEditing(!editing)}>
          {editing ? t.done : t.edit}
        </button>
      </div>
      {floors.length === 0 && (
        <div className="card">
          <p>{t.home.empty}</p>
        </div>
      )}
      {floors.map((floor) => (
        <section key={floor.id} className="card floor">
          <a className="floor-name" href={href.place(floor.id)}>
            <Named thing={floor} kind="place" />
            <ShortageBadge shortage={shortageIn(locations, stock, floor.id)} />
          </a>
          <div className="chips">
            {childrenOf(locations, floor.id).map((room) => (
              <a key={room.id} className="chip" href={href.place(room.id)}>
                <Named thing={room} kind="place" />
                <ShortageBadge shortage={shortageIn(locations, stock, room.id)} />
              </a>
            ))}
          </div>
        </section>
      ))}
      {editing && (
        <div className="card edit-panel">
          <AddForm
            label={t.home.addFloor}
            onSubmit={async (name) => Boolean(await actions.addLocation(name, null))}
          />
          {floors.length > 0 && <p className="muted small">{t.home.editHint}</p>}
        </div>
      )}
    </>
  )
}
