import { useState, type ReactNode } from 'react'
import type { ChoreOut, ItemOut, RequestOut, StockOut } from './api'
import { useHouse } from './house'
import { IconPicker } from './IconPicker'
import { COMMON_ITEMS } from './icons'
import { LevelName, LevelPicker } from './LevelPicker'
import { Named } from './Named'
import { href } from './route'
import { ShortageBadge } from './ShortageBadge'
import { t } from './strings'
import { ago } from './time'
import { AddForm } from './AddForm'
import { AddItemForm } from './AddItemForm'
import { MAX_DEPTH, childrenOf, pathTo, shortageIn } from './tree'
import { byItem, findItem, fullName, groupByName, hasVariants } from './variants'

/** One place: the places inside it, and the level of everything kept here. */
export function PlacePage({ id }: { id: number }) {
  const { me, house, actions } = useHouse()
  const [editing, setEditing] = useState(false)
  // The item name whose "new variant" field is open.
  const [addingVariantTo, setAddingVariantTo] = useState<string>()
  if (!house) return null
  const { locations, items, stock, chores, requests } = house

  const path = pathTo(locations, id)
  const place = path.at(-1)
  if (!place) {
    return (
      <div className="card">
        <p>{t.place.notFound}</p>
        <a className="link" href={href.home}>
          {t.back}
        </a>
      </div>
    )
  }

  const depth = path.length
  const parent = path.at(-2)
  const children = childrenOf(locations, id)
  const siblings = childrenOf(locations, place.parent_id)
  const index = siblings.findIndex((sibling) => sibling.id === id)
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const rows = stock
    .filter((row) => row.location_id === id && itemsById.has(row.item_id))
    .map((row) => ({ ...row, item: itemsById.get(row.item_id)! }))
    .sort((a, b) => byItem(a.item, b.item))
  const groups = groupByName(rows, (row) => row.item)
  const choresHere = chores.filter((chore) => chore.location_id === id)
  // Who's on it, for an item claimed for this place.
  const claimText = (request: RequestOut | undefined) =>
    request?.claimed_by_id == null
      ? undefined
      : request.claimed_by_id === me.id
        ? t.todo.mine
        : t.todo.theirs(request.claimed_by_name ?? '')
  const keptHere = new Set(rows.map((row) => row.item_id))
  // Items not kept here yet, then common supplies not in the catalogue yet.
  const known = new Set(items.map((item) => item.name.toLocaleLowerCase('hu')))
  const suggestions = [
    ...items
      .filter((item) => !keptHere.has(item.id))
      .sort(byItem)
      .map(fullName),
    ...COMMON_ITEMS.filter((name) => !known.has(name.toLocaleLowerCase('hu'))),
  ]

  /** Keeps an item here, from the catalogue or new; a new variant takes its group's look. */
  async function addItem(name: string, variant: string | null) {
    const sibling = items.find(
      (i) => i.name.toLocaleLowerCase('hu') === name.toLocaleLowerCase('hu'),
    )
    const item =
      findItem(items, name, variant) ??
      (await actions.addItem({
        name: sibling?.name ?? name,
        variant,
        category: sibling?.category,
        icon: sibling?.icon,
      }))
    return Boolean(item && (await actions.setLevel(id, item.id, 'plenty')))
  }

  const row = (r: (typeof rows)[number], title: ReactNode) => (
    <StockRow
      key={r.item_id}
      row={r}
      item={r.item}
      title={title}
      claim={claimText(
        requests.find((request) => request.item_id === r.item_id && request.location_id === id),
      )}
      editing={editing}
      onLevel={(level) => actions.setLevel(id, r.item_id, level)}
      onRemove={() => actions.removeStock(id, r.item_id)}
    />
  )

  const variantForm = (name: string) =>
    addingVariantTo === name && (
      <li key={`${name}-variant-form`} className="variant-form">
        <AddForm
          label={t.place.addVariantLabel(name)}
          placeholder={t.place.addVariantPlaceholder}
          suggestions={items
            .filter((i) => i.name === name && i.variant && !keptHere.has(i.id))
            .map((i) => i.variant!)}
          onSubmit={async (variant) => {
            const saved = await addItem(name, variant)
            if (saved) setAddingVariantTo(undefined)
            return saved
          }}
          onCancel={() => setAddingVariantTo(undefined)}
        />
      </li>
    )

  const addVariantButton = (name: string) =>
    editing && (
      <button
        type="button"
        className="secondary small-button"
        onClick={() => setAddingVariantTo(name)}
      >
        + {t.place.addVariant}
      </button>
    )

  async function remove() {
    if (!place || !window.confirm(t.place.confirmDelete(place.name))) return
    if (await actions.deleteLocation(id)) {
      window.location.replace(parent ? href.place(parent.id) : href.home)
    }
  }

  return (
    <>
      <nav className="crumbs">
        <a href={parent ? href.place(parent.id) : href.home} aria-label={t.back}>
          ←
        </a>
        {path.slice(0, -1).map((ancestor) => (
          <a key={ancestor.id} href={href.place(ancestor.id)}>
            {ancestor.name}
          </a>
        ))}
      </nav>
      <div className="title-row">
        <h2>
          <Named thing={place} kind="place" />
        </h2>
        <button type="button" className="secondary" onClick={() => setEditing(!editing)}>
          {editing ? t.done : t.edit}
        </button>
      </div>

      {editing && (
        <div className="card edit-panel">
          <AddForm
            key={place.name}
            label={t.place.rename}
            initial={place.name}
            onSubmit={async (name) => Boolean(await actions.updateLocation(id, { name }))}
          />
          <IconPicker
            kind="place"
            name={place.name}
            value={place.icon}
            onChange={(icon) => actions.updateLocation(id, { icon })}
          />
          {siblings.length > 1 && (
            <div className="actions">
              <button
                type="button"
                className="secondary"
                disabled={index === 0}
                onClick={() => actions.updateLocation(id, { position: index - 1 })}
              >
                ↑ {t.place.moveUp}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={index === siblings.length - 1}
                onClick={() => actions.updateLocation(id, { position: index + 1 })}
              >
                ↓ {t.place.moveDown}
              </button>
            </div>
          )}
          {depth < MAX_DEPTH && (
            <AddForm
              label={t.place.addChild[depth - 1]}
              onSubmit={async (name) => Boolean(await actions.addLocation(name, id))}
            />
          )}
          {children.length ? (
            <p className="muted">{t.place.deleteHasChildren}</p>
          ) : (
            <div className="actions">
              <button type="button" className="danger" onClick={remove}>
                {t.place.delete}
              </button>
            </div>
          )}
        </div>
      )}

      {children.length > 0 && (
        <section className="card">
          <h3>{t.place.childrenTitle[depth - 1]}</h3>
          <div className="chips">
            {children.map((child) => (
              <a key={child.id} className="chip" href={href.place(child.id)}>
                <Named thing={child} kind="place" />
                <ShortageBadge shortage={shortageIn(locations, stock, child.id)} />
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h3>{t.place.stockTitle}</h3>
        {rows.length === 0 && <p className="muted">{t.place.noStock}</p>}
        <ul className="stock">
          {groups.map((group) =>
            hasVariants(group, (r) => r.item) ? (
              <li key={group.name} className="stock-group">
                <div className="group-head">
                  <Named thing={{ name: group.name, icon: group.first.icon }} kind="item" />
                  {addVariantButton(group.name)}
                </div>
                <ul>
                  {group.rows.map((r) =>
                    row(r, r.item.variant ?? <span className="muted">{t.items.noVariant}</span>),
                  )}
                  {variantForm(group.name)}
                </ul>
              </li>
            ) : (
              [
                row(
                  group.rows[0],
                  <span className="group-head">
                    <Named thing={group.rows[0].item} kind="item" />
                    {addVariantButton(group.name)}
                  </span>,
                ),
                variantForm(group.name),
              ]
            ),
          )}
        </ul>
        <AddItemForm
          suggestions={suggestions}
          variantsOf={(name) =>
            items
              .filter(
                (i) =>
                  i.variant &&
                  !keptHere.has(i.id) &&
                  i.name.toLocaleLowerCase('hu') === name.toLocaleLowerCase('hu'),
              )
              .map((i) => i.variant!)
          }
          onSubmit={addItem}
        />
      </section>

      <section className="card">
        <h3>{t.place.choresTitle}</h3>
        {choresHere.length === 0 && !editing && <p className="muted">{t.place.noChores}</p>}
        <ul className="missing-rows">
          {choresHere.map((chore) => (
            <ChoreRow
              key={chore.id}
              chore={chore}
              request={requests.find((request) => request.chore_id === chore.id)}
              claim={claimText}
              editing={editing}
            />
          ))}
        </ul>
        {editing && (
          <AddForm
            label={t.place.addChore}
            placeholder={t.place.addChorePlaceholder}
            onSubmit={async (name) => Boolean(await actions.addChore(id, name))}
          />
        )}
      </section>
    </>
  )
}

/** A chore here: report it with one tap, see who's on it, or mark it done. */
function ChoreRow({
  chore,
  request,
  claim,
  editing,
}: {
  chore: ChoreOut
  request: RequestOut | undefined
  claim: (request: RequestOut | undefined) => string | undefined
  editing: boolean
}) {
  const { actions } = useHouse()
  let action: ReactNode
  if (editing) {
    action = (
      <button
        type="button"
        className="icon"
        aria-label={t.place.removeChore(chore.name)}
        onClick={() => {
          if (window.confirm(t.place.confirmRemoveChore(chore.name))) {
            void actions.deleteChore(chore.id)
          }
        }}
      >
        ×
      </button>
    )
  } else if (request) {
    action = (
      <span className="chore-state">
        <span className="small muted">{claim(request) ?? t.place.reported}</span>
        <button
          type="button"
          className="secondary small-button"
          onClick={() => actions.act('done', [request.id])}
        >
          ✓ {t.todo.done}
        </button>
      </span>
    )
  } else {
    action = (
      <button type="button" className="small-button" onClick={() => actions.reportChore(chore.id)}>
        {t.place.report}
      </button>
    )
  }
  return (
    <li>
      <Named thing={chore} kind="chore" />
      {action}
    </li>
  )
}

/** One item's level here: its name (or variant), who set it when, and the level buttons. */
function StockRow({
  row,
  item,
  title,
  claim,
  editing,
  onLevel,
  onRemove,
}: {
  row: StockOut
  item: ItemOut
  title: ReactNode
  // Who's buying it, if someone said so.
  claim: string | undefined
  editing: boolean
  onLevel: (level: StockOut['level']) => void
  onRemove: () => void
}) {
  return (
    <li>
      <div className="stock-name">
        {title}
        {editing ? (
          <button
            type="button"
            className="icon"
            aria-label={t.place.removeItem(fullName(item))}
            onClick={onRemove}
          >
            ×
          </button>
        ) : (
          <span className="small">
            <LevelName level={row.level} />
            <span className="muted">
              {t.place.updated(row.updated_by_name, ago(row.updated_at))}
            </span>
            {claim && <span className="claim"> · {claim}</span>}
          </span>
        )}
      </div>
      <LevelPicker level={row.level} label={fullName(item)} onChange={onLevel} />
    </li>
  )
}
