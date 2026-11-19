import { useState } from 'react'
import { useHouse } from './house'
import { RecipeName } from './Named'
import { missingCount, RECIPE_KINDS } from './recipes'
import { Week } from './CookingPages'
import { href, type MenuView } from './route'
import { StarterRecipes } from './StarterRecipes'
import { t } from './strings'

// The search survives a visit to a recipe and back.
const SEARCH_KEY = 'recipes-search'

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

/** The recipes by kind, each with whether everything it takes is at home. */
function Recipes() {
  const { house } = useHouse()
  const [search, setSearch] = useState(() => {
    try {
      return sessionStorage.getItem(SEARCH_KEY) ?? ''
    } catch {
      return ''
    }
  })
  if (!house) return null
  const { recipes, items, stock } = house
  const wanted = fold(search.trim())
  const found = recipes
    .filter((recipe) => fold(recipe.name).includes(wanted))
    .sort((a, b) => a.name.localeCompare(b.name, 'hu'))

  function changeSearch(text: string) {
    setSearch(text)
    try {
      sessionStorage.setItem(SEARCH_KEY, text)
    } catch {
      // Only a convenience.
    }
  }

  return (
    <>
      {recipes.length > 0 && (
        <input
          type="search"
          className="search"
          placeholder={t.menu.search}
          aria-label={t.menu.search}
          value={search}
          onChange={(event) => changeSearch(event.target.value)}
        />
      )}
      {found.length === 0 ? (
        <div className="card">
          <p>{recipes.length ? t.menu.noMatch : t.menu.noRecipes}</p>
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
                  const missing = missingCount(recipe, recipes, items, stock)
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
