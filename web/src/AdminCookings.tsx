import { useEffect, useState } from 'react'
import { listUsers, type CookingOut, type UserOut } from './api'
import { Leftovers, NeedList, PlanPreview } from './CookingPages'
import { cookingNeeds, cookingStatus, recipeOf, takesSide } from './cookings'
import { dayTitle, today } from './days'
import { useHouse } from './house'
import { RecipeName } from './Named'
import { RECIPE_KINDS } from './recipes'
import { t } from './strings'

/** The planned cookings in a table, each changed or marked cooked below its row; a new
 * one on top. Everything the phone's Menu does, for anyone. */
export function AdminCookings() {
  const { house } = useHouse()
  const [people, setPeople] = useState<UserOut[]>([])
  // A cooking's id and what's open below it, or 'new'.
  const [open, setOpen] = useState<{ id: number; what: 'edit' | 'left' } | 'new'>()
  useEffect(() => {
    listUsers().then(
      ({ data }) => data && setPeople(data),
      () => {},
    )
  }, [])
  if (!house) return null
  const toggle = (next: typeof open) =>
    setOpen(JSON.stringify(open) === JSON.stringify(next) ? undefined : next)

  return (
    <>
      <div className="admin-filters">
        <button type="button" aria-expanded={open === 'new'} onClick={() => toggle('new')}>
          + {t.admin.planCooking}
        </button>
      </div>
      {open === 'new' && (
        <div className="card admin-editor">
          <PlanForm people={people} onDone={() => setOpen(undefined)} />
        </div>
      )}
      {house.cookings.length === 0 ? (
        <p className="muted">{t.admin.noCookings}</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t.admin.day}</th>
                <th>{t.admin.dish}</th>
                <th>{t.admin.cook}</th>
                <th>{t.admin.state}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {house.cookings.map((cooking) => {
                const status = cookingStatus(cookingNeeds(house, cooking))
                const editing = open !== 'new' && open?.id === cooking.id ? open.what : undefined
                return [
                  <tr key={cooking.id}>
                    <td className="small">{dayTitle(cooking.day)}</td>
                    <td>
                      <Dish cooking={cooking} />
                    </td>
                    <td>
                      <CookSelect cooking={cooking} people={people} />
                    </td>
                    <td className={`small agenda-status ${status.tone}`}>{status.text}</td>
                    <td className="edit-cell">
                      <button
                        type="button"
                        className="secondary small-button"
                        onClick={() => toggle({ id: cooking.id, what: 'edit' })}
                      >
                        {editing === 'edit' ? t.admin.close : t.admin.edit}
                      </button>{' '}
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => toggle({ id: cooking.id, what: 'left' })}
                      >
                        {t.menu.cooked}
                      </button>
                    </td>
                  </tr>,
                  editing && (
                    <tr key={`${cooking.id}-${editing}`} className="edit-row">
                      <td colSpan={5}>
                        {editing === 'edit' ? (
                          <EditCooking cooking={cooking} onDone={() => setOpen(undefined)} />
                        ) : (
                          <>
                            <h4>{t.menu.leftTitle}</h4>
                            <Leftovers cooking={cooking} onDone={() => setOpen(undefined)} />
                          </>
                        )}
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Dish({ cooking }: { cooking: CookingOut }) {
  const { house } = useHouse()
  const recipe = house && recipeOf(house, cooking.recipe_id)
  const side = house && recipeOf(house, cooking.side_id)
  if (!recipe) return null
  return (
    <span className="recipe-line">
      <RecipeName recipe={recipe} />
      {side && <span className="small muted">{t.menu.withSide(side.name)}</span>}
    </span>
  )
}

/** Who cooks it: anyone, or nobody yet. */
function CookSelect({ cooking, people }: { cooking: CookingOut; people: UserOut[] }) {
  const { actions } = useHouse()
  return (
    <select
      aria-label={t.admin.cook}
      value={cooking.cook_id ?? ''}
      onChange={(event) =>
        void actions.updateCooking(cooking.id, {
          cook_id: event.target.value ? Number(event.target.value) : null,
        })
      }
    >
      <option value="">{t.admin.nobody}</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.display_name}
        </option>
      ))}
    </select>
  )
}

/** The side dishes to pick from, and none. */
function SideSelect({
  value,
  onChange,
}: {
  value: number | null
  onChange: (id: number | null) => void
}) {
  const { house } = useHouse()
  const sides = (house?.recipes ?? [])
    .filter((recipe) => recipe.kind === 'side')
    .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
  return (
    <label>
      {t.menu.side}
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">{t.menu.noSide}</option>
        {sides.map((side) => (
          <option key={side.id} value={side.id}>
            {side.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A new cooking: the recipe, its day, side dish and cook, and what it puts on the list. */
function PlanForm({ people, onDone }: { people: UserOut[]; onDone: () => void }) {
  const { house, actions } = useHouse()
  const [recipeId, setRecipeId] = useState<number>()
  const [day, setDay] = useState(today())
  const [sideId, setSideId] = useState<number | null>(null)
  const [cookId, setCookId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  if (!house) return null
  const recipe = recipeId === undefined ? undefined : recipeOf(house, recipeId)
  const side = recipe !== undefined && takesSide(recipe, house.recipes)

  async function plan() {
    if (!recipe) return
    setSaving(true)
    const cooking = await actions.planCooking({
      recipe_id: recipe.id,
      side_id: side ? sideId : null,
      day,
      cook_id: cookId,
    })
    setSaving(false)
    if (cooking) onDone()
  }

  return (
    <div className="item-form wide">
      <label>
        {t.menu.recipe}
        <select
          value={recipeId ?? ''}
          onChange={(event) =>
            setRecipeId(event.target.value ? Number(event.target.value) : undefined)
          }
        >
          <option value="">—</option>
          {RECIPE_KINDS.filter((kind) => kind !== 'base').map((kind) => {
            const ofKind = house.recipes
              .filter((r) => r.kind === kind)
              .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
            return (
              ofKind.length > 0 && (
                <optgroup key={kind} label={t.menu.kindGroups[kind]}>
                  {ofKind.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )
            )
          })}
        </select>
      </label>
      <label>
        {t.admin.day}
        <input
          type="date"
          value={day}
          min={today()}
          required
          onChange={(event) => setDay(event.target.value)}
        />
      </label>
      {side && <SideSelect value={sideId} onChange={setSideId} />}
      <label>
        {t.admin.cook}
        <select
          value={cookId ?? ''}
          onChange={(event) => setCookId(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">{t.admin.nobody}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.display_name}
            </option>
          ))}
        </select>
      </label>
      {recipe && (
        <PlanPreview
          plan={{ recipe_id: recipe.id, side_id: side ? sideId : null, bought_item_ids: [] }}
          day={day}
        />
      )}
      <div className="actions">
        <button type="button" className="secondary" onClick={onDone} disabled={saving}>
          {t.cancel}
        </button>
        <button type="button" disabled={saving || !recipe || !day} onClick={() => void plan()}>
          {t.menu.planIt}
        </button>
      </div>
    </div>
  )
}

/** A cooking's day and side dish, what it needs, and cancelling it. */
function EditCooking({ cooking, onDone }: { cooking: CookingOut; onDone: () => void }) {
  const { house, actions } = useHouse()
  if (!house) return null
  const recipe = recipeOf(house, cooking.recipe_id)

  async function cancel() {
    if (!house || !recipe) return
    if (!window.confirm(t.menu.confirmCancel(recipe.name, dayTitle(cooking.day)))) return
    if (await actions.cancelCooking(cooking.id)) onDone()
  }

  return (
    <div className="item-form wide">
      <label>
        {t.admin.day}
        <input
          type="date"
          value={cooking.day}
          min={today()}
          required
          onChange={(event) =>
            event.target.value &&
            void actions.updateCooking(cooking.id, { day: event.target.value })
          }
        />
      </label>
      {recipe && takesSide(recipe, house.recipes) && (
        <SideSelect
          value={cooking.side_id}
          onChange={(id) => void actions.updateCooking(cooking.id, { side_id: id })}
        />
      )}
      <NeedList needs={cookingNeeds(house, cooking)} />
      <div className="actions">
        <button type="button" className="danger" onClick={() => void cancel()}>
          {t.menu.cancelCooking}
        </button>
      </div>
    </div>
  )
}
