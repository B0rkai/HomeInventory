import { useState } from 'react'
import { useHouse } from './house'
import { RecipeName } from './MenuPage'
import { RecipeEditor } from './RecipeEditor'
import { ingredientText, missingCount } from './recipes'
import { t } from './strings'

/** Every recipe in a table, edited below its row; a new one, with a pasted list, on top. */
export function AdminRecipes() {
  const { house } = useHouse()
  // A recipe's id, or 'new'.
  const [editing, setEditing] = useState<number | 'new'>()
  if (!house) return null
  const { recipes, items, stock } = house
  const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name, 'hu'))
  const toggle = (id: number | 'new') => setEditing(editing === id ? undefined : id)

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
                <th>{t.admin.name}</th>
                <th>{t.menu.ingredients}</th>
                <th>{t.admin.state}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((recipe) => {
                const missing = missingCount(recipe, items, stock)
                return [
                  <tr key={recipe.id}>
                    <td>
                      <RecipeName recipe={recipe} />
                    </td>
                    <td className="small">
                      {recipe.ingredients
                        .map((ingredient) => ingredientText(ingredient, items))
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
                      <td colSpan={4}>
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
    </>
  )
}
