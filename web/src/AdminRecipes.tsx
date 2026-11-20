import { useState } from 'react'
import type { RecipeOut } from './api'
import { useHouse } from './house'
import { RecipeName } from './Named'
import { RecipeEditor } from './RecipeEditor'
import { ingredientText, missingCount, RECIPE_KINDS } from './recipes'
import { StarterRecipes } from './StarterRecipes'
import { t } from './strings'

type SortKey = 'name' | 'kind' | 'missing'

/** Every recipe in a table, edited below its row; a new one, with a pasted list, on top.
 * Those with nothing missing first, then fewest missing; or by name or kind. */
export function AdminRecipes() {
  const { house } = useHouse()
  // A recipe's id, or 'new'.
  const [editing, setEditing] = useState<number | 'new'>()
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({
    key: 'missing',
    down: false,
  })
  if (!house) return null
  const { recipes, items, stock } = house
  const missing = new Map(
    recipes.map((recipe) => [recipe.id, missingCount(recipe, recipes, items, stock)]),
  )
  const missingOf = (id: number) => missing.get(id) ?? 0
  const byKind = (a: RecipeOut, b: RecipeOut) =>
    RECIPE_KINDS.indexOf(a.kind) - RECIPE_KINDS.indexOf(b.kind)
  const byName = (a: RecipeOut, b: RecipeOut) => a.name.localeCompare(b.name, 'hu')
  const sorted = [...recipes].sort((a, b) => {
    const by =
      sort.key === 'missing'
        ? missingOf(a.id) - missingOf(b.id)
        : sort.key === 'kind'
          ? byKind(a, b)
          : byName(a, b)
    return (sort.down ? -by : by) || byKind(a, b) || byName(a, b)
  })
  const toggle = (id: number | 'new') => setEditing(editing === id ? undefined : id)
  const header = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.down ? 'descending' : 'ascending') : undefined}>
      <button
        type="button"
        className="sort-button"
        onClick={() => setSort({ key, down: sort.key === key && !sort.down })}
      >
        {label} {sort.key === key ? (sort.down ? '↓' : '↑') : ''}
      </button>
    </th>
  )

  return (
    <>
      <div className="admin-filters">
        <button type="button" aria-expanded={editing === 'new'} onClick={() => toggle('new')}>
          + {t.menu.addRecipe}
        </button>
        <span className="small muted">{t.admin.recipeCount(recipes.length)}</span>
      </div>
      {editing === 'new' && (
        <div className="card admin-editor">
          <RecipeEditor
            paste
            onSaved={() => setEditing(undefined)}
            onCancel={() => setEditing(undefined)}
          />
        </div>
      )}
      {sorted.length === 0 ? (
        <p className="muted">{t.menu.noRecipes}</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {header('name', t.admin.name)}
                {header('kind', t.menu.kind)}
                <th>{t.menu.ingredients}</th>
                {header('missing', t.admin.state)}
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((recipe) => {
                const missing = missingOf(recipe.id)
                return [
                  <tr key={recipe.id}>
                    <td>
                      <RecipeName recipe={recipe} />
                    </td>
                    <td className="small">{t.menu.kinds[recipe.kind]}</td>
                    <td className="small">
                      {recipe.ingredients
                        .map((ingredient) => ingredientText(ingredient, items, recipes))
                        .join(', ')}
                    </td>
                    <td className="small">
                      {missing ? (
                        <span className="muted">{t.menu.missing(missing)}</span>
                      ) : (
                        <span className="all-there">{t.menu.allAtHome}</span>
                      )}
                    </td>
                    <td className="edit-cell">
                      <button
                        type="button"
                        className="secondary small-button"
                        onClick={() => toggle(recipe.id)}
                      >
                        {editing === recipe.id ? t.admin.close : t.admin.edit}
                      </button>
                    </td>
                  </tr>,
                  editing === recipe.id && (
                    <tr key={`${recipe.id}-edit`} className="edit-row">
                      <td colSpan={5}>
                        <RecipeEditor
                          recipe={recipe}
                          paste
                          onSaved={() => setEditing(undefined)}
                          onCancel={() => setEditing(undefined)}
                          onDeleted={() => setEditing(undefined)}
                        />
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
      <StarterRecipes />
    </>
  )
}
