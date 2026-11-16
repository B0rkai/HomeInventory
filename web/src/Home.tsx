import { useState } from 'react'
import { useHouse } from './house'
import { href } from './route'
import { ShortageBadge } from './ShortageBadge'
import { t } from './strings'
import { childrenOf, shortageIn } from './tree'
import { AddForm } from './AddForm'

/** Every floor with its rooms, so any place is one tap away. */
export function Home() {
  const { house, actions } = useHouse()
  // Open while the house is empty, so the first floors go in one after another.
  const [adding, setAdding] = useState(() => !house?.locations.length)
  if (!house) return null
  const { locations, stock } = house
  const floors = childrenOf(locations, null)

  return (
    <>
      {floors.length === 0 && (
        <div className="card">
          <p>{t.home.empty}</p>
        </div>
      )}
      {floors.map((floor) => (
        <section key={floor.id} className="card floor">
          <a className="floor-name" href={href.place(floor.id)}>
            <span>{floor.name}</span>
            <ShortageBadge shortage={shortageIn(locations, stock, floor.id)} />
          </a>
          <div className="chips">
            {childrenOf(locations, floor.id).map((room) => (
              <a key={room.id} className="chip" href={href.place(room.id)}>
                {room.name}
                <ShortageBadge shortage={shortageIn(locations, stock, room.id)} />
              </a>
            ))}
          </div>
        </section>
      ))}
      <div className="card">
        {adding ? (
          <AddForm
            label={t.home.addFloor}
            onSubmit={async (name) => Boolean(await actions.addLocation(name, null))}
            onCancel={floors.length ? () => setAdding(false) : undefined}
          />
        ) : (
          <div className="actions spread">
            <a className="link" href={href.items}>
              {t.home.items}
            </a>
            <button type="button" className="secondary" onClick={() => setAdding(true)}>
              + {t.home.addFloor}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
