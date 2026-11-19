import { useState } from 'react'
import { useHouse } from './house'
import { RecipeName } from './MenuPage'
import { type Starter, startersLeft, startersWithParts, starterBody } from './starterRecipes'
import { t } from './strings'

/** The suggested recipes not added yet, each added with a tap (with the base recipes it
 * takes), or all at once; open by itself while there are no recipes. */
export function StarterRecipes() {
  const { house, actions } = useHouse()
  const [adding, setAdding] = useState(false)
  if (!house) return null
  const left = startersLeft(house.recipes)
  if (!left.length) return null

  async function add(picked: Starter[]) {
    if (!house) return
    setAdding(true)
    const order = startersWithParts(picked, house.recipes)
    await actions.addRecipes(order.map((starter) => starterBody(starter, house.items)))
    setAdding(false)
  }

  return (
    <details className="card starters" open={house.recipes.length === 0}>
      <summary>
        {t.menu.starters} <span className="muted">({left.length})</span>
      </summary>
      <p className="small muted">{t.menu.startersHint}</p>
      <ul className="item-list">
        {left.map((starter) => (
          <li key={starter.name} className="item-row">
            <span>
              <RecipeName recipe={{ name: starter.name, icon: null }} />
              <span className="small muted starter-ingredients">
                {starter.ingredients
                  .filter((ingredient) => !ingredient.optional)
                  .map((ingredient) => ingredient.text)
                  .join(', ')}
              </span>
            </span>
            <button
              type="button"
              className="secondary small-button"
              disabled={adding}
              onClick={() => add([starter])}
            >
              + {t.menu.addStarter}
            </button>
          </li>
        ))}
      </ul>
      {left.length > 1 && (
        <div className="actions">
          <button type="button" disabled={adding} onClick={() => add(left)}>
            {t.menu.addAllStarters}
          </button>
        </div>
      )}
    </details>
  )
}
