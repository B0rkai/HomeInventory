import { useState } from 'react'
import type { CookingOut, Level, RecipeOut } from './api'
import {
  cookingName,
  cookingNeeds,
  cookingStatus,
  type Need,
  needName,
  type Plan,
  recipeOf,
  takesSide,
} from './cookings'
import { dayChip, dayTitle, nextDays } from './days'
import { useHouse } from './house'
import { LevelName, LevelPicker } from './LevelPicker'
import { Named, RecipeName } from './Named'
import { missingCount, RECIPE_KINDS } from './recipes'
import { href } from './route'
import { t } from './strings'
import { placePath, treeOrder } from './tree'
import { byItem, fullName } from './variants'

/** Lower case without accents, so "fozelek" finds "Főzelék". */
const fold = (text: string) =>
  text
    .toLocaleLowerCase('hu')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

function Crumbs({ to, label }: { to: string; label: string }) {
  return (
    <nav className="crumbs">
      <a
        href={to}
        aria-label={t.back}
        onClick={(event) => {
          event.preventDefault()
          history.back()
        }}
      >
        ←
      </a>
      <a href={to}>{label}</a>
    </nav>
  )
}

/** The recipe with its side dish, if it has one. */
function CookingTitle({ cooking }: { cooking: Pick<Plan, 'recipe_id' | 'side_id'> }) {
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

/** The Menu tab's week: the days with cookings on them, each cooking with how it stands. */
export function Week() {
  const { me, house } = useHouse()
  if (!house) return null
  const days = [...new Set(house.cookings.map((cooking) => cooking.day))].sort()
  return (
    <>
      {days.length === 0 && (
        <div className="card">
          <p>{t.menu.noCookings}</p>
          <p className="muted small">{t.menu.noCookingsHint}</p>
        </div>
      )}
      {days.map((day) => (
        <section key={day} className="card agenda-day">
          <h3>{dayTitle(day)}</h3>
          <ul className="item-list">
            {house.cookings
              .filter((cooking) => cooking.day === day)
              .map((cooking) => {
                const status = cookingStatus(cookingNeeds(house, cooking))
                return (
                  <li key={cooking.id}>
                    <a className="item-row" href={href.cooking(cooking.id)}>
                      <CookingTitle cooking={cooking} />
                      <span className="small muted">
                        {cooking.cook_id === me.id
                          ? t.menu.youCook
                          : cooking.cook_name && t.menu.cooks(cooking.cook_name)}
                      </span>
                    </a>
                    <p className={`small agenda-status ${status.tone}`}>{status.text}</p>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
      <div className="actions one-off-toggle">
        <button
          type="button"
          className="secondary small-button"
          onClick={() => (window.location.hash = href.plan())}
        >
          + {t.menu.addCooking}
        </button>
      </div>
    </>
  )
}

/** Today and the nine days after, one tap each. */
export function DayChips({ value, onPick }: { value?: string; onPick: (day: string) => void }) {
  return (
    <div className="group-tabs day-chips" role="radiogroup" aria-label={t.menu.whichDay}>
      {nextDays().map((day) => (
        <button
          key={day}
          type="button"
          role="radio"
          className="chip"
          aria-checked={day === value}
          onClick={() => onPick(day)}
        >
          {dayChip(day)}
        </button>
      ))}
    </div>
  )
}

/** The side dishes, and none. */
export function SideChips({
  value,
  onPick,
}: {
  value: number | null
  onPick: (id: number | null) => void
}) {
  const { house } = useHouse()
  const sides = (house?.recipes ?? [])
    .filter((recipe) => recipe.kind === 'side')
    .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
  return (
    <div className="chips side-chips" role="radiogroup" aria-label={t.menu.side}>
      {[null, ...sides].map((side) => (
        <button
          key={side?.id ?? 'none'}
          type="button"
          role="radio"
          className="chip"
          aria-checked={(side?.id ?? null) === value}
          onClick={() => onPick(side?.id ?? null)}
        >
          {side ? side.name : t.menu.noSide}
        </button>
      ))}
    </div>
  )
}

/** What planning it would do: what's at home, what goes on the list, what's on it already. */
export function PlanPreview({ plan }: { plan: Plan }) {
  const { house } = useHouse()
  if (!house) return null
  const needs = cookingNeeds(house, plan)
  const named = (states: Need['state'][]) =>
    needs
      .filter((need) => states.includes(need.state))
      .map((need) =>
        need.instead
          ? `${needName(need)} (${t.menu.instead(fullName(need.instead.item))})`
          : needName(need),
      )
      .join(', ')
  const lines: [string, string, string][] = [
    ['ok', '✓', `${t.menu.atHome}: ${named(['home', 'instead'])}`],
    ['low', '+', `${t.menu.willList}: ${named(['missing'])}`],
    ['muted', '·', `${t.menu.listedAlready}: ${named(['listed'])}`],
  ]
  return (
    <div className="plan-preview small">
      {lines
        .filter(([, , text]) => !text.endsWith(': '))
        .map(([tone, mark, text]) => (
          <p key={tone}>
            <span className={`mark ${tone}`}>{mark}</span> {text}
          </p>
        ))}
    </div>
  )
}

/** "+ Főzés": a recipe, then its day (and side dish), and what that puts on the list. */
export function PlanPage({ recipeId }: { recipeId?: number }) {
  const { house } = useHouse()
  if (!house) return null
  const recipe = recipeId === undefined ? undefined : recipeOf(house, recipeId)
  return recipe ? <PlanRecipe key={recipe.id} recipe={recipe} /> : <PickRecipe />
}

function PickRecipe() {
  const { house } = useHouse()
  const [search, setSearch] = useState('')
  if (!house) return null
  const { recipes, items, stock } = house
  const wanted = fold(search.trim())
  // Base recipes are only parts of others.
  const found = recipes
    .filter((recipe) => recipe.kind !== 'base' && fold(recipe.name).includes(wanted))
    .sort((a, b) => a.name.localeCompare(b.name, 'hu'))
  return (
    <>
      <Crumbs to={href.menu} label={t.menu.title} />
      <h2>{t.menu.whatToCook}</h2>
      <input
        type="search"
        className="search"
        placeholder={t.menu.search}
        aria-label={t.menu.search}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {found.length === 0 && (
        <div className="card">
          <p>{recipes.length ? t.menu.noMatch : t.menu.noRecipes}</p>
        </div>
      )}
      {RECIPE_KINDS.map((kind) => {
        const ofKind = found.filter((recipe) => recipe.kind === kind)
        if (!ofKind.length) return null
        return (
          <section key={kind} className="card">
            <h3>{t.menu.kindGroups[kind]}</h3>
            <ul className="item-list">
              {ofKind.map((recipe) => {
                const missing = missingCount(recipe, recipes, items, stock)
                return (
                  <li key={recipe.id}>
                    <a
                      className="item-row"
                      href={href.plan(recipe.id)}
                      onClick={(event) => {
                        // The pick replaces the list: back goes to where planning began.
                        event.preventDefault()
                        window.location.replace(href.plan(recipe.id))
                      }}
                    >
                      <RecipeName recipe={recipe} />
                      <span className="small">
                        {missing ? (
                          <span className="muted">{t.menu.missing(missing)}</span>
                        ) : (
                          <span className="all-there">{t.menu.allAtHome}</span>
                        )}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </>
  )
}

function PlanRecipe({ recipe }: { recipe: RecipeOut }) {
  const { me, house, actions } = useHouse()
  const [day, setDay] = useState<string>()
  const [sideId, setSideId] = useState<number | null>(null)
  const [iCook, setICook] = useState(false)
  const [saving, setSaving] = useState(false)
  if (!house) return null
  const side = takesSide(recipe, house.recipes)

  async function plan() {
    if (!day) return
    setSaving(true)
    const cooking = await actions.planCooking({
      recipe_id: recipe.id,
      side_id: side ? sideId : null,
      day,
      cook_id: iCook ? me.id : null,
    })
    setSaving(false)
    if (cooking) window.location.replace(href.menu)
  }

  return (
    <>
      <Crumbs to={href.menu} label={t.menu.title} />
      <h2 className="recipe-title">
        <RecipeName recipe={recipe} />
        <span className="small muted">{t.menu.kinds[recipe.kind]}</span>
      </h2>
      <div className="card">
        <h3>{t.menu.whichDay}</h3>
        <DayChips value={day} onPick={setDay} />
      </div>
      {side && (
        <div className="card">
          <h3>{t.menu.side}</h3>
          <SideChips value={sideId} onPick={setSideId} />
        </div>
      )}
      {day && (
        <div className="card">
          <PlanPreview
            plan={{ recipe_id: recipe.id, side_id: side ? sideId : null, bought_item_ids: [] }}
          />
          <div className="actions spread">
            <button
              type="button"
              className="chip cook-toggle"
              aria-pressed={iCook}
              onClick={() => setICook(!iCook)}
            >
              {t.menu.iCook}
            </button>
            <button type="button" disabled={saving} onClick={() => void plan()}>
              {t.menu.planIt}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Who cooks it: me (and "Mégsem"), the other, or nobody yet ("Elvállalom"). */
function CookRow({ cooking }: { cooking: CookingOut }) {
  const { me, actions } = useHouse()
  const set = (cookId: number | null) => void actions.updateCooking(cooking.id, { cook_id: cookId })
  if (cooking.cook_id === me.id)
    return (
      <p className="small cook-row">
        <span className="claim">{t.menu.youCook}</span>
        <button type="button" className="secondary small-button" onClick={() => set(null)}>
          {t.menu.unclaimCook}
        </button>
      </p>
    )
  if (cooking.cook_name)
    return <p className="small cook-row muted">{t.menu.cooks(cooking.cook_name)}</p>
  return (
    <p className="small cook-row">
      <span className="muted">{t.menu.nobodyCooks}</span>
      <button type="button" className="secondary small-button" onClick={() => set(me.id)}>
        {t.menu.claimCook}
      </button>
    </p>
  )
}

/** A cooking's ingredients, each with how it stands. */
export function NeedList({ needs }: { needs: Need[] }) {
  return (
    <ul className="item-list">
      {needs.map((need) => {
        const [first] = need.items
        if (!first) return null
        return (
          <li key={`${need.ingredient.item_id}:${need.ingredient.any_variant}`}>
            <a className="item-row" href={href.item(first.id)}>
              <span className="recipe-line">
                <Named
                  thing={need.ingredient.any_variant ? { ...first, variant: null } : first}
                  kind="item"
                />
                {need.ingredient.amount && (
                  <span className="small muted">· {need.ingredient.amount}</span>
                )}
              </span>
              <span className="small">
                <NeedState need={need} />
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

function NeedState({ need }: { need: Need }) {
  switch (need.state) {
    case 'optional':
      return <span className="muted">{t.menu.ifAny}</span>
    case 'home':
      return <LevelName level={need.level!} />
    case 'instead':
      return (
        <>
          <span className="muted">{t.menu.instead(fullName(need.instead!.item))} · </span>
          <LevelName level={need.instead!.level} />
        </>
      )
    case 'bought':
      return <span className="all-there">{t.menu.bought}</span>
    case 'listed':
      return (
        <span className="on-list">
          {need.line?.claimed_by_name
            ? `${t.menu.onList} · ${t.admin.claimedBy(need.line.claimed_by_name)}`
            : t.menu.onList}
        </span>
      )
    case 'missing':
      return <span className="off-list">{t.menu.offList}</span>
  }
}

function CookingGone() {
  return (
    <div className="card">
      <p>{t.menu.cookingNotFound}</p>
      <a className="link" href={href.menu}>
        {t.back}
      </a>
    </div>
  )
}

/** A planned cooking: its day, who cooks, what it needs; cancel, move, mark it cooked. */
export function CookingPage({ id, left }: { id: number; left: boolean }) {
  const { house, actions } = useHouse()
  const [changing, setChanging] = useState<'day' | 'side'>()
  if (!house) return null
  const cooking = house.cookings.find((c) => c.id === id)
  if (!cooking) return <CookingGone />
  const recipe = recipeOf(house, cooking.recipe_id)
  if (!recipe) return <CookingGone />

  if (left)
    return (
      <>
        <Crumbs to={href.cooking(id)} label={recipe.name} />
        <h2>{t.menu.leftTitle}</h2>
        <Leftovers cooking={cooking} onDone={() => window.location.replace(href.menu)} />
      </>
    )

  const needs = cookingNeeds(house, cooking)

  async function cancel() {
    if (!house || !cooking) return
    const question = t.menu.confirmCancel(cookingName(house, cooking), dayTitle(cooking.day))
    if (!window.confirm(question)) return
    if (await actions.cancelCooking(id)) window.location.replace(href.menu)
  }

  async function change(body: { day?: string; side_id?: number | null }) {
    if (await actions.updateCooking(id, body)) setChanging(undefined)
  }

  return (
    <>
      <Crumbs to={href.menu} label={t.menu.title} />
      <div className="title-row">
        <h2 className="recipe-title">
          <CookingTitle cooking={cooking} />
        </h2>
        <a className="small link" href={href.recipe(recipe.id)}>
          {t.menu.recipe}
        </a>
      </div>
      <div className="card">
        <p>
          <strong>{dayTitle(cooking.day)}</strong>
        </p>
        <CookRow cooking={cooking} />
      </div>
      <section className="card">
        <h3>{t.menu.ingredients}</h3>
        {needs.length === 0 && <p className="muted">{t.menu.noIngredients}</p>}
        <NeedList needs={needs} />
      </section>
      {changing === 'day' && (
        <div className="card">
          <h3>{t.menu.whichDay}</h3>
          <DayChips value={cooking.day} onPick={(day) => void change({ day })} />
        </div>
      )}
      {changing === 'side' && (
        <div className="card">
          <h3>{t.menu.side}</h3>
          <SideChips value={cooking.side_id} onPick={(side) => void change({ side_id: side })} />
        </div>
      )}
      <div className="actions one-off-toggle">
        <button type="button" className="danger" onClick={() => void cancel()}>
          {t.menu.cancelCooking}
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={changing === 'day'}
          onClick={() => setChanging(changing === 'day' ? undefined : 'day')}
        >
          {t.menu.moveCooking}
        </button>
        {takesSide(recipe, house.recipes) && (
          <button
            type="button"
            className="secondary"
            aria-pressed={changing === 'side'}
            onClick={() => setChanging(changing === 'side' ? undefined : 'side')}
          >
            {t.menu.changeSide}
          </button>
        )}
        <button type="button" onClick={() => (window.location.hash = href.cookingDone(id))}>
          {t.menu.cooked}
        </button>
      </div>
    </>
  )
}

/** "Mi maradt?": a level picker for each ingredient where it's kept; "Kész" marks the
 * cooking cooked with the levels changed. */
export function Leftovers({ cooking, onDone }: { cooking: CookingOut; onDone: () => void }) {
  const { house, actions } = useHouse()
  const [levels, setLevels] = useState(new Map<string, Level>())
  const [saving, setSaving] = useState(false)
  if (!house) return null
  const ids = new Set(
    cookingNeeds(house, cooking).flatMap((need) => need.items.map((item) => item.id)),
  )
  const itemsById = new Map(house.items.map((item) => [item.id, item]))
  const order = new Map(treeOrder(house.locations).map((place, index) => [place.id, index]))
  const rows = house.stock
    .filter((row) => ids.has(row.item_id))
    .sort(
      (a, b) =>
        byItem(itemsById.get(a.item_id)!, itemsById.get(b.item_id)!) ||
        (order.get(a.location_id) ?? 0) - (order.get(b.location_id) ?? 0),
    )
  const key = (row: { item_id: number; location_id: number }) => `${row.item_id}:${row.location_id}`

  async function finish() {
    setSaving(true)
    const changed = rows
      .filter((row) => levels.has(key(row)) && levels.get(key(row)) !== row.level)
      .map((row) => ({
        item_id: row.item_id,
        location_id: row.location_id,
        level: levels.get(key(row))!,
      }))
    const ok = await actions.completeCooking(cooking.id, changed)
    setSaving(false)
    if (ok) onDone()
  }

  return (
    <>
      <p className="muted small">{t.menu.leftHint(cookingName(house, cooking))}</p>
      <section className="card">
        {rows.length === 0 && <p className="muted">{t.menu.leftNone}</p>}
        <ul className="stock">
          {rows.map((row) => {
            const item = itemsById.get(row.item_id)!
            return (
              <li key={key(row)}>
                <div className="stock-name">
                  <Named thing={item} kind="item" />
                  <span className="small muted">{placePath(house.locations, row.location_id)}</span>
                </div>
                <LevelPicker
                  level={levels.get(key(row)) ?? row.level}
                  label={fullName(item)}
                  onChange={(level) => setLevels(new Map(levels).set(key(row), level))}
                />
              </li>
            )
          })}
        </ul>
      </section>
      <div className="actions one-off-toggle">
        <button type="button" disabled={saving} onClick={() => void finish()}>
          {t.done}
        </button>
      </div>
    </>
  )
}
