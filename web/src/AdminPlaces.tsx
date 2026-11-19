import { type FormEvent, useState } from 'react'
import type { LocationOut } from './api'
import { AdminAddItem } from './AdminAddItem'
import { TextCell } from './AdminItems'
import { useHouse } from './house'
import { iconOf } from './iconLookup'
import { IconPicker } from './IconPicker'
import { IconTile } from './Named'
import { t } from './strings'
import { MAX_DEPTH, childrenOf, pathTo, placePath, subtreeIds, treeOrder } from './tree'

/** The whole tree of places in a table: rename, icon, order, move under another, delete. */
export function AdminPlaces() {
  const { house, actions } = useHouse()
  // A row opened below a place: its icon, or adding items to it.
  const [editing, setEditing] = useState<{ id: number; what: 'icon' | 'item' }>()
  if (!house) return null
  const { locations, stock, chores } = house
  const open = (id: number, what: 'icon' | 'item') =>
    setEditing(editing?.id === id && editing.what === what ? undefined : { id, what })
  const depthOf = (id: number) => pathTo(locations, id).length
  // How many levels it and what's inside it take up.
  const heightOf = (id: number) =>
    Math.max(...[...subtreeIds(locations, id)].map(depthOf)) - depthOf(id) + 1
  const ordered = treeOrder(locations)

  return (
    <>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.admin.name}</th>
              <th>{t.admin.parent}</th>
              <th>{t.admin.order}</th>
              <th>{t.admin.contents}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ordered.map((location) => {
              const siblings = childrenOf(locations, location.parent_id)
              const index = siblings.findIndex((s) => s.id === location.id)
              const inside = subtreeIds(locations, location.id)
              // Not into itself, nor so deep that what's inside it would be too deep.
              const parents = ordered.filter(
                (p) => !inside.has(p.id) && depthOf(p.id) + heightOf(location.id) <= MAX_DEPTH,
              )
              const hasChildren = inside.size > 1
              const move = (position: number) =>
                void actions.updateLocation(location.id, { position })
              return (
                <PlaceRow
                  key={location.id}
                  location={location}
                  depth={depthOf(location.id)}
                  editing={editing?.id === location.id ? editing.what : undefined}
                  onEdit={() => setEditing(undefined)}
                >
                  <td>
                    <select
                      aria-label={t.admin.parent}
                      value={location.parent_id ?? ''}
                      onChange={(event) =>
                        void actions.updateLocation(location.id, {
                          parent_id: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                    >
                      <option value="">{t.admin.floor}</option>
                      {parents.map((p) => (
                        <option key={p.id} value={p.id}>
                          {placePath(locations, p.id)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="order-cell">
                    <button
                      type="button"
                      className="icon"
                      aria-label={t.admin.up}
                      disabled={index === 0}
                      onClick={() => move(index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon"
                      aria-label={t.admin.down}
                      disabled={index === siblings.length - 1}
                      onClick={() => move(index + 1)}
                    >
                      ↓
                    </button>
                  </td>
                  <td className="small muted">
                    {t.admin.counts(
                      stock.filter((row) => row.location_id === location.id).length,
                      chores.filter((chore) => chore.location_id === location.id).length,
                    )}
                  </td>
                  <td className="edit-cell">
                    <button
                      type="button"
                      className="secondary small-button"
                      aria-expanded={editing?.id === location.id && editing.what === 'item'}
                      onClick={() => open(location.id, 'item')}
                    >
                      {t.admin.addHere}
                    </button>
                    <button
                      type="button"
                      className="secondary small-button"
                      aria-expanded={editing?.id === location.id && editing.what === 'icon'}
                      onClick={() => open(location.id, 'icon')}
                    >
                      {t.admin.icon}
                    </button>
                    <button
                      type="button"
                      className="danger small-button"
                      disabled={hasChildren}
                      title={hasChildren ? t.place.deleteHasChildren : undefined}
                      onClick={() => {
                        if (window.confirm(t.place.confirmDelete(location.name)))
                          void actions.deleteLocation(location.id)
                      }}
                    >
                      {t.admin.deletePlace}
                    </button>
                  </td>
                </PlaceRow>
              )
            })}
          </tbody>
        </table>
      </div>
      <AddPlace />
    </>
  )
}

function PlaceRow({
  location,
  depth,
  editing,
  onEdit,
  children,
}: {
  location: LocationOut
  depth: number
  editing?: 'icon' | 'item'
  onEdit: () => void
  children: React.ReactNode
}) {
  const { actions } = useHouse()
  return (
    <>
      <tr className={depth === 1 ? 'floor-row' : undefined}>
        <td>
          <div className="name-cell" style={{ paddingLeft: `${(depth - 1) * 1.75}rem` }}>
            <IconTile icon={iconOf(location, 'place')} name={location.name} kind="place" />
            <TextCell
              key={location.name}
              value={location.name}
              label={t.admin.name}
              required
              onSave={(name) => void actions.updateLocation(location.id, { name })}
            />
          </div>
        </td>
        {children}
      </tr>
      {editing === 'item' && (
        <tr className="edit-row">
          <td colSpan={5}>
            <AdminAddItem locationId={location.id} />
          </td>
        </tr>
      )}
      {editing === 'icon' && (
        <tr className="edit-row">
          <td colSpan={5}>
            <IconPicker
              kind="place"
              name={location.name}
              value={location.icon}
              onChange={(icon) => {
                void actions.updateLocation(location.id, { icon })
                onEdit()
              }}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function AddPlace() {
  const { house, actions } = useHouse()
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  if (!house) return null
  const { locations } = house

  async function add(event: FormEvent) {
    event.preventDefault()
    const added = await actions.addLocation(name.trim(), parent ? Number(parent) : null)
    if (added) setName('')
  }

  return (
    <form className="admin-filters" onSubmit={add}>
      <input
        className="search"
        aria-label={t.admin.addPlace}
        placeholder={t.admin.addPlaceName}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
      />
      <select
        aria-label={t.admin.parent}
        value={parent}
        onChange={(event) => setParent(event.target.value)}
      >
        <option value="">{t.admin.floor}</option>
        {treeOrder(locations)
          .filter((location) => pathTo(locations, location.id).length < MAX_DEPTH)
          .map((location) => (
            <option key={location.id} value={location.id}>
              {placePath(locations, location.id)}
            </option>
          ))}
      </select>
      <button type="submit" disabled={!name.trim()}>
        + {t.admin.addPlace}
      </button>
    </form>
  )
}
