import { useState } from 'react'
import { useHouse } from './house'
import { RecipeName } from './Named'
import { missingCount, RECIPE_KINDS } from './recipes'
import { Week } from './CookingPages'
import { href, type MenuView } from './route'
import { StarterRecipes } from './StarterRecipes'
import { t } from './strings'

// The search and the filter survive a visit to a recipe and back; the order is kept.
const SEARCH_KEY = 'recipes-search'
const READY_KEY = 'recipes-ready'
const ORDER_KEY = 'recipes-order'

type Order = 'missing' | 'name'

function load(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function save(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value)
  } catch {
    // Only a convenience.
  }
}

const fold = (text: string) =>
  text
    .toLocaleLowerCase('hu')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

/** The two views' tabs: the week's cookings, the recipes. */
function MenuTabs({ view }: { view: MenuView }) {
  return (
    <div className="tabs" role="tablist">
      {(['week', 'recipes'] as const).map((tab) => {
        const to = tab === 'week' ? href.menu : href.recipes
        return (
          <a
            key={tab}
            role="tab"
            aria-selected={view === tab}
            href={to}
            onClick={(event) => {
              // Switching views shouldn't add to the back button's history.
              event.preventDefault()
              window.location.replace(to)
            }}
          >
            {tab === 'week' ? t.menu.week : t.menu.recipes}
          </a>
        )
      })}
    </div>
  )
}

/** The Menu tab: the week's cookings, or the recipes. */
export function MenuPage({ view }: { view: MenuView }) {
  return (
    <>
      <h2>{t.menu.title}</h2>
      <MenuTabs view={view} />
      {view === 'week' ? <Week /> : <Recipes />}
    </>
  )
}

/** The recipes by kind, each with whether everything it takes is at home: by default
 * those with nothing missing first, then fewest missing; or by name. "Megvan" keeps only
 * those with nothing missing. */
function Recipes() {
  const { house } = useHouse()
  const [search, setSearch] = useState(() => load(() => sessionStorage, SEARCH_KEY) ?? '')
  const [readyOnly, setReadyOnly] = useState(() => load(() => sessionStorage, READY_KEY) === '1')
  const [order, setOrder] = useState<Order>(() =>
    load(() => localStorage, ORDER_KEY) === 'name' ? 'name' : 'missing',
  )
  if (!house) return null
  const { recipes, items, stock } = house
  const missing = new Map(
    recipes.map((recipe) => [recipe.id, missingCount(recipe, recipes, items, stock)]),
  )
  const missingOf = (id: number) => missing.get(id) ?? 0
  const wanted = fold(search.trim())
  const found = recipes
    .filter(
      (recipe) =>
        fold(recipe.name).includes(wanted) && (!readyOnly || missingOf(recipe.id) === 0),
    )
    .sort(
      (a, b) =>
        (order === 'missing' ? missingOf(a.id) - missingOf(b.id) : 0) ||
        a.name.localeCompare(b.name, 'hu'),
    )

  function changeSearch(text: string) {
    setSearch(text)
    save(() => sessionStorage, SEARCH_KEY, text)
  }

  function flipReady() {
    setReadyOnly(!readyOnly)
    save(() => sessionStorage, READY_KEY, readyOnly ? '0' : '1')
  }

  function flipOrder() {
    const next = order === 'missing' ? 'name' : 'missing'
    setOrder(next)
    save(() => localStorage, ORDER_KEY, next)
  }

  return (
    <>
      {recipes.length > 0 && (
        <div className="filter-row">
          <input
            type="search"
            className="search"
            placeholder={t.menu.search}
            aria-label={t.menu.search}
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
          />
          <button
            type="button"
            className="secondary small-button order-button"
            aria-pressed={readyOnly}
            onClick={flipReady}
          >
            {t.menu.readyOnly}
          </button>
          <button
            type="button"
            className="secondary small-button order-button"
            onClick={flipOrder}
            title={t.menu.orderHint}
          >
            {order === 'missing' ? t.menu.byMissing : t.menu.byName}
          </button>
        </div>
      )}
      {found.length === 0 ? (
        <div className="card">
          <p>
            {!recipes.length
              ? t.menu.noRecipes
              : readyOnly && !wanted
                ? t.menu.noneReady
                : t.menu.noMatch}
          </p>
        </div>
      ) : (
        RECIPE_KINDS.map((kind) => {
          const ofKind = found.filter((recipe) => recipe.kind === kind)
          if (!ofKind.length) return null
          return (
            <section key={kind} className="card">
              <h3>{t.menu.kindGroups[kind]}</h3>
              <ul className="item-list">
                {ofKind.map((recipe) => {
                  const missing = missingOf(recipe.id)
                  return (
                    <li key={recipe.id}>
                      <a className="item-row" href={href.recipe(recipe.id)}>
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
        })
      )}
      <div className="actions one-off-toggle">
        <button
          type="button"
          className="secondary small-button"
          onClick={() => (window.location.hash = href.recipeEdit())}
        >
          + {t.menu.addRecipe}
        </button>
      </div>
      <StarterRecipes />
    </>
  )
}
