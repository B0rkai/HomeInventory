import { useState } from 'react'
import type { RecipeOut } from './api'
import { useHouse } from './house'
import { iconOf } from './iconLookup'
import { IconTile } from './Named'
import { missingCount } from './recipes'
import { href } from './route'
import { t } from './strings'

// The search survives a visit to a recipe and back.
const SEARCH_KEY = 'recipes-search'

const fold = (text: string) =>
  text
    .toLocaleLowerCase('hu')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

/** A recipe's tile and name. */
export function RecipeName({ recipe }: { recipe: Pick<RecipeOut, 'name' | 'icon'> }) {
  return (
    <span className="named">
      <IconTile icon={iconOf(recipe, 'recipe')} name={recipe.name} kind="recipe" hue="food" />
      <span>{recipe.name}</span>
    </span>
  )
}

/** The Menu tab: the recipes, each with whether everything it takes is at home. */
export function MenuPage() {
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
      <h2>{t.menu.title}</h2>
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
        <section className="card">
          <h3>{t.menu.recipes}</h3>
          <ul className="item-list">
            {found.map((recipe) => {
              const missing = missingCount(recipe, items, stock)
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
    </>
  )
}
