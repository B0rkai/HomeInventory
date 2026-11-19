import { useHouse } from './house'
import { LevelName } from './LevelPicker'
import { RecipeName } from './MenuPage'
import { Named } from './Named'
import { RecipeEditor } from './RecipeEditor'
import { ingredientItems, ingredientLevel, missingCount, takenBy } from './recipes'
import { href } from './route'
import { t } from './strings'

function Crumbs() {
  return (
    <nav className="crumbs">
      <a
        href={href.menu}
        aria-label={t.back}
        onClick={(event) => {
          event.preventDefault()
          history.back()
        }}
      >
        ←
      </a>
      <a href={href.menu}>{t.menu.title}</a>
    </nav>
  )
}

function NotFound() {
  return (
    <div className="card">
      <p>{t.menu.notFound}</p>
      <a className="link" href={href.menu}>
        {t.back}
      </a>
    </div>
  )
}

/** A recipe: what it takes, with how much of each the house has, its note and link. */
export function RecipePage({ id }: { id: number }) {
  const { house } = useHouse()
  if (!house) return null
  const { items, stock, recipes } = house
  const recipe = recipes.find((r) => r.id === id)
  if (!recipe) return <NotFound />
  const users = takenBy(recipe, recipes)

  return (
    <>
      <Crumbs />
      <div className="title-row">
        <h2>
          <RecipeName recipe={recipe} />
        </h2>
        <button
          type="button"
          className="secondary"
          onClick={() => (window.location.hash = href.recipeEdit(id))}
        >
          {t.edit}
        </button>
      </div>
      <p className="small muted recipe-kind-line">{t.menu.kinds[recipe.kind]}</p>
      <section className="card">
        <h3>{t.menu.ingredients}</h3>
        {recipe.ingredients.length === 0 && <p className="muted">{t.menu.noIngredients}</p>}
        <ul className="item-list">
          {recipe.ingredients.map((ingredient) => {
            const part = recipes.find((r) => r.id === ingredient.part_id)
            if (part) {
              const missing = missingCount(part, recipes, items, stock)
              return (
                <li key={`part-${part.id}`}>
                  <a className="item-row" href={href.recipe(part.id)}>
                    <span>
                      <RecipeName recipe={part} />
                      <span className="small muted"> · {t.menu.partBadge}</span>
                      {ingredient.amount && (
                        <span className="small muted"> · {ingredient.amount}</span>
                      )}
                    </span>
                    <span className="small">
                      {ingredient.optional ? (
                        <span className="muted">{t.menu.ifAny}</span>
                      ) : missing ? (
                        <span className="muted">{t.menu.missing(missing)}</span>
                      ) : (
                        <span className="all-there">{t.menu.allAtHome}</span>
                      )}
                    </span>
                  </a>
                </li>
              )
            }
            const [first] = ingredientItems(ingredient, items)
            if (!first) return null
            const level = ingredientLevel(ingredient, items, stock)
            return (
              <li key={ingredient.item_id}>
                <a className="item-row" href={href.item(first.id)}>
                  <span>
                    <Named
                      thing={ingredient.any_variant ? { ...first, variant: null } : first}
                      kind="item"
                    />
                    {ingredient.any_variant && (
                      <span className="small muted"> · {t.menu.anyVariant}</span>
                    )}
                    {ingredient.amount && (
                      <span className="small muted"> · {ingredient.amount}</span>
                    )}
                  </span>
                  <span className="small">
                    {ingredient.optional ? (
                      <span className="muted">{t.menu.ifAny}</span>
                    ) : level ? (
                      <LevelName level={level} />
                    ) : (
                      <span className="muted">{t.menu.notAtHome}</span>
                    )}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
        {recipe.note && <p className="recipe-note">{recipe.note}</p>}
        {recipe.link && (
          <p className="small">
            <a className="link" href={recipe.link} target="_blank" rel="noopener noreferrer">
              {t.menu.link} ↗
            </a>
          </p>
        )}
      </section>
      {users.length > 0 && (
        <section className="card">
          <h3>{t.menu.usedIn}</h3>
          <ul className="item-list">
            {users.map((user) => (
              <li key={user.id}>
                <a className="item-row" href={href.recipe(user.id)}>
                  <RecipeName recipe={user} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** Adding a recipe (no id) or changing one. */
export function RecipeEditPage({ id }: { id?: number }) {
  const { house } = useHouse()
  if (!house) return null
  const recipe = id === undefined ? undefined : house.recipes.find((r) => r.id === id)
  if (id !== undefined && !recipe) return <NotFound />

  return (
    <>
      <Crumbs />
      <h2>{recipe ? recipe.name : t.menu.addRecipe}</h2>
      <div className="card">
        <RecipeEditor
          recipe={recipe}
          onSaved={(saved) => window.location.replace(href.recipe(saved.id))}
          onCancel={() => history.back()}
          onDeleted={() => window.location.replace(href.menu)}
        />
      </div>
    </>
  )
}
