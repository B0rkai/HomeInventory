import { type FormEvent, useState } from 'react'
import type { GroupOut, Hue } from './api'
import { TextCell } from './AdminItems'
import { groupOf, groupOrder, subgroupsOf, topGroups, topOf } from './groups'
import { useHouse } from './house'
import { iconChoices } from './icons'
import { IconTile } from './Named'
import { t } from './strings'

const HUES: Hue[] = ['food', 'drink', 'clean', 'body', 'home']

/**
 * The item groups, each followed by its subgroups: rename, colour (a group's), the icons
 * that suggest a subgroup, order, move a subgroup to another group, delete; add one.
 */
export function AdminGroups() {
  const { house, actions } = useHouse()
  // The subgroup whose icons are open below its row.
  const [editing, setEditing] = useState<number>()
  if (!house) return null
  const { groups, items } = house
  const tops = topGroups(groups)
  // Items by the group or subgroup they're in, chosen or by their icon.
  const counts = new Map<number, number>()
  for (const item of items) {
    const id = groupOf(item, groups)?.id
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const chosen = (id: number) => items.some((item) => item.group_id === id)

  return (
    <>
      <p className="small muted">{t.admin.groupsHint}</p>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.admin.name}</th>
              <th>{t.admin.groupColour}</th>
              <th>{t.admin.groupIcons}</th>
              <th>{t.admin.order}</th>
              <th>{t.admin.items}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groupOrder(groups).map((group) => {
              const top = group.parent_id === null
              const siblings = top ? tops : subgroupsOf(groups, group.parent_id!)
              const index = siblings.findIndex((s) => s.id === group.id)
              const move = (position: number) => void actions.updateGroup(group.id, { position })
              const hasSubgroups = top && subgroupsOf(groups, group.id).length > 0
              // A group goes only once empty; a subgroup's items move up to its group.
              const blocked = top && (hasSubgroups || chosen(group.id))
              return [
                <tr key={group.id} className={top ? 'floor-row' : undefined}>
                  <td>
                    <div className="name-cell" style={{ paddingLeft: top ? 0 : '1.75rem' }}>
                      <span className={`tile hue-${topOf(group, groups).hue}`} aria-hidden="true" />
                      <TextCell
                        key={group.name}
                        value={group.name}
                        label={t.admin.name}
                        required
                        onSave={(name) => void actions.updateGroup(group.id, { name })}
                      />
                    </div>
                  </td>
                  <td>
                    {top ? (
                      <select
                        aria-label={t.admin.groupColour}
                        value={group.hue ?? 'food'}
                        onChange={(event) =>
                          void actions.updateGroup(group.id, { hue: event.target.value as Hue })
                        }
                      >
                        {HUES.map((hue) => (
                          <option key={hue} value={hue}>
                            {t.admin.hues[hue]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        aria-label={t.admin.parentGroup}
                        value={group.parent_id!}
                        onChange={(event) =>
                          void actions.updateGroup(group.id, {
                            parent_id: Number(event.target.value),
                          })
                        }
                      >
                        {tops.map((option) => (
                          <option key={option.id} value={option.id}>
                            {t.admin.under(option.name)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {!top && (
                      <button
                        type="button"
                        className="icons-cell"
                        aria-expanded={editing === group.id}
                        title={t.admin.editIcons}
                        onClick={() => setEditing(editing === group.id ? undefined : group.id)}
                      >
                        {group.icons.length ? (
                          group.icons.map((icon) => (
                            <IconTile
                              key={icon}
                              icon={icon}
                              name=""
                              kind="item"
                              hue={topOf(group, groups).hue ?? undefined}
                            />
                          ))
                        ) : (
                          <span className="muted small">{t.admin.noIcons}</span>
                        )}
                      </button>
                    )}
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
                  <td className="small muted">{counts.get(group.id) ?? 0}</td>
                  <td className="edit-cell">
                    <button
                      type="button"
                      className="danger small-button"
                      disabled={blocked}
                      title={blocked ? t.errors.groupNotEmpty : undefined}
                      onClick={() => {
                        const ask = top
                          ? t.admin.confirmDeleteGroup(group.name)
                          : t.admin.confirmDeleteSubgroup(group.name, topOf(group, groups).name)
                        if (window.confirm(ask)) void actions.deleteGroup(group.id)
                      }}
                    >
                      {t.admin.deleteGroup}
                    </button>
                  </td>
                </tr>,
                editing === group.id && (
                  <tr key={`${group.id}-icons`} className="edit-row">
                    <td colSpan={6}>
                      <GroupIcons group={group} />
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>
      <AddGroup groups={tops} />
    </>
  )
}

/** The icons that suggest a subgroup, each toggled on or off. */
function GroupIcons({ group }: { group: GroupOut }) {
  const { house, actions } = useHouse()
  const hue = house ? topOf(group, house.groups).hue : null
  const toggle = (icon: string) => {
    const icons = group.icons.includes(icon)
      ? group.icons.filter((other) => other !== icon)
      : [...group.icons, icon]
    void actions.updateGroup(group.id, { icons })
  }
  return (
    <div className="group-icons">
      <p className="small muted">{t.admin.groupIconsHint}</p>
      <div className="icon-grid">
        {iconChoices('item').map((icon) => (
          <button
            key={icon}
            type="button"
            className="icon-option"
            aria-pressed={group.icons.includes(icon)}
            aria-label={icon}
            title={icon}
            onClick={() => toggle(icon)}
          >
            <IconTile icon={icon} name="" kind="item" hue={hue ?? undefined} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** A new group (with a colour), or a subgroup of one. */
function AddGroup({ groups }: { groups: GroupOut[] }) {
  const { actions } = useHouse()
  const [name, setName] = useState('')
  // A group's id for a subgroup; empty for a group.
  const [parent, setParent] = useState('')
  const [hue, setHue] = useState<Hue>('food')

  async function add(event: FormEvent) {
    event.preventDefault()
    // Stays open for the next one.
    const added = await actions.addGroup(
      parent ? { name: name.trim(), parent_id: Number(parent) } : { name: name.trim(), hue },
    )
    if (added) setName('')
  }

  return (
    <form className="admin-filters" onSubmit={add}>
      <input
        className="search"
        aria-label={t.admin.addGroup}
        placeholder={t.admin.addGroupName}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
      />
      <select
        aria-label={t.admin.parentGroup}
        value={parent}
        onChange={(event) => setParent(event.target.value)}
      >
        <option value="">{t.admin.newTopGroup}</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {t.admin.under(group.name)}
          </option>
        ))}
      </select>
      {!parent && (
        <select
          aria-label={t.admin.groupColour}
          value={hue}
          onChange={(event) => setHue(event.target.value as Hue)}
        >
          {HUES.map((option) => (
            <option key={option} value={option}>
              {t.admin.hues[option]}
            </option>
          ))}
        </select>
      )}
      <button type="submit" disabled={!name.trim()}>
        + {t.admin.addGroup}
      </button>
    </form>
  )
}
