import { type FormEvent, type KeyboardEvent, useId, useState } from 'react'
import type { RecipeOut } from './api'
import { useHouse } from './house'
import { IconPicker } from './IconPicker'
import {
  ingredientFrom,
  ingredientText,
  knownIngredient,
  parseIngredients,
  RECIPE_KINDS,
  recipeNamed,
  takenBy,
  takes,
} from './recipes'
import { t } from './strings'
import { byItem, fullName } from './variants'

// The server's limits.
const NAME_MAX_LENGTH = 60
const AMOUNT_MAX_LENGTH = 40
const NOTE_MAX_LENGTH = 2000
const LINK_MAX_LENGTH = 500

// `part`: the text names a recipe, taken whole.
type Row = { key: number; text: string; amount: string; optional: boolean; part: boolean }

let rowKeys = 0

/**
 * A recipe's name, ingredients (one at a time, from the catalogue's names or new ones, or
 * other recipes' names: "Nokedli" in "Paprikás csirke"), note, link and icon. `paste`: the admin pages' box that takes a whole ingredient list.
 */
export function RecipeEditor({
  recipe,
  paste = false,
  onSaved,
  onCancel,
  onDeleted,
}: {
  recipe?: RecipeOut
  paste?: boolean
  onSaved: (recipe: RecipeOut) => void
  onCancel: () => void
  onDeleted?: () => void
}) {
  const id = useId()
  const { house, actions } = useHouse()
  const items = house?.items ?? []
  const recipes = house?.recipes ?? []
  const [name, setName] = useState(recipe?.name ?? '')
  const [icon, setIcon] = useState(recipe?.icon ?? null)
  const [kind, setKind] = useState(recipe?.kind ?? 'main')
  const [note, setNote] = useState(recipe?.note ?? '')
  const [link, setLink] = useState(recipe?.link ?? '')
  const [rows, setRows] = useState<Row[]>(
    () =>
      recipe?.ingredients.map((ingredient) => ({
        key: ++rowKeys,
        text: ingredientText(ingredient, items, recipes),
        amount: ingredient.amount ?? '',
        optional: ingredient.optional,
        part: ingredient.part_id !== null,
      })) ?? [],
  )
  const [adding, setAdding] = useState('')
  const [pasted, setPasted] = useState('')
  const [saving, setSaving] = useState(false)

  // A name kept in variants alone means any of them; or one variant; or a recipe, but not
  // this one or one taking it.
  const suggestions = [
    ...new Set([
      ...items.filter((item) => item.variant).map((item) => item.name),
      ...[...items].sort(byItem).map(fullName),
      ...recipes
        .filter((other) => !recipe || !takes(other, recipe.id, recipes))
        .map((other) => other.name)
        .sort((a, b) => a.localeCompare(b, 'hu')),
    ]),
  ]
  const isPart = (text: string) => recipeNamed(text, recipes) !== undefined
  // A part that would have the recipe take itself; the server refuses it.
  const loops = (row: Row) => {
    const part = row.part && recipe ? recipeNamed(row.text, recipes) : undefined
    return part !== undefined && takes(part, recipe!.id, recipes)
  }
  const change = (key: number, fields: Partial<Row>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...fields } : row)))
  const addRows = (added: { text: string; amount: string }[]) =>
    setRows([
      ...rows,
      ...added.map((row) => ({ key: ++rowKeys, optional: false, part: isPart(row.text), ...row })),
    ])

  function addTyped() {
    if (!adding.trim()) return
    addRows([{ text: adding.trim(), amount: '' }])
    setAdding('')
  }

  function addKeys(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the ingredient, it doesn't save the recipe.
    if (event.key === 'Enter') {
      event.preventDefault()
      addTyped()
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const body = {
      name: name.trim(),
      icon,
      kind,
      note: note.trim() || null,
      link: link.trim() || null,
      ingredients: rows
        .filter((row) => row.text.trim())
        .map((row) => ingredientFrom(row.text, items, row)),
    }
    const saved = recipe
      ? await actions.updateRecipe(recipe.id, body)
      : await actions.addRecipe(body)
    setSaving(false)
    if (saved) onSaved(saved)
  }

  async function remove() {
    if (!recipe) return
    const users = takenBy(recipe, recipes).map((other) => other.name)
    const question = users.length
      ? t.menu.confirmDeletePart(recipe.name, users.join(', '))
      : t.menu.confirmDelete(recipe.name)
    if (!window.confirm(question)) return
    if (await actions.deleteRecipe(recipe.id)) onDeleted?.()
  }

  return (
    <form
      className={paste ? 'item-form recipe-form wide' : 'item-form recipe-form'}
      onSubmit={save}
    >
      <label>
        {t.menu.name}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.menu.namePlaceholder}
          maxLength={NAME_MAX_LENGTH}
          required
        />
      </label>
      <div className="recipe-kind">
        <span className="small">{t.menu.kind}</span>
        <div className="segmented" role="radiogroup" aria-label={t.menu.kind}>
          {RECIPE_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => setKind(option)}
            >
              {t.menu.kinds[option]}
            </button>
          ))}
        </div>
        <span className="small muted">{t.menu.kindHint[kind]}</span>
      </div>
      <fieldset className="ingredients">
        <legend>{t.menu.ingredients}</legend>
        {rows.length === 0 && <p className="small muted">{t.menu.noIngredients}</p>}
        <ul>
          {rows.map((row) => (
            <li key={row.key}>
              <span className="ingredient-name">
                <input
                  aria-label={t.menu.ingredient}
                  value={row.text}
                  onChange={(event) =>
                    change(row.key, { text: event.target.value, part: isPart(event.target.value) })
                  }
                  list={`${id}-items`}
                  maxLength={NAME_MAX_LENGTH + 43}
                  autoComplete="off"
                />
                {loops(row) ? (
                  <span className="new-item small">{t.menu.loop}</span>
                ) : row.part ? (
                  <span className="part-badge small">{t.menu.partBadge}</span>
                ) : (
                  row.text.trim() &&
                  !knownIngredient(row.text, items) && (
                    <span className="new-item small">{t.menu.newItem}</span>
                  )
                )}
              </span>
              <input
                className="ingredient-amount"
                aria-label={t.menu.amount}
                placeholder={t.menu.amountPlaceholder}
                value={row.amount}
                onChange={(event) => change(row.key, { amount: event.target.value })}
                maxLength={AMOUNT_MAX_LENGTH}
              />
              <label className="check ingredient-optional" title={t.menu.optionalHint}>
                <input
                  type="checkbox"
                  checked={row.optional}
                  onChange={(event) => change(row.key, { optional: event.target.checked })}
                />
                <span>{t.menu.ifAny}</span>
              </label>
              <button
                type="button"
                className="icon"
                aria-label={t.menu.removeIngredient(row.text)}
                onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input
            aria-label={t.menu.ingredient}
            placeholder={t.menu.ingredientPlaceholder}
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            onKeyDown={addKeys}
            list={`${id}-items`}
            maxLength={NAME_MAX_LENGTH + 43}
            autoComplete="off"
            enterKeyHint="next"
          />
          <button type="button" className="secondary" disabled={!adding.trim()} onClick={addTyped}>
            {t.add}
          </button>
        </div>
        {paste && (
          <details className="paste">
            <summary>{t.menu.paste}</summary>
            <p className="small muted">{t.menu.pasteHint}</p>
            <textarea rows={6} value={pasted} onChange={(event) => setPasted(event.target.value)} />
            <button
              type="button"
              className="secondary"
              disabled={!pasted.trim()}
              onClick={() => {
                addRows(parseIngredients(pasted, items))
                setPasted('')
              }}
            >
              {t.menu.pasteAdd}
            </button>
          </details>
        )}
        <datalist id={`${id}-items`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </fieldset>
      <label>
        {t.menu.note}
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={NOTE_MAX_LENGTH}
        />
      </label>
      <label>
        {t.menu.link}
        <input
          type="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder={t.menu.linkPlaceholder}
          maxLength={LINK_MAX_LENGTH}
        />
      </label>
      <IconPicker kind="recipe" name={name} value={icon} onChange={setIcon} />
      <div className="actions spread">
        {recipe ? (
          <button type="button" className="danger" onClick={remove} disabled={saving}>
            {t.menu.deleteRecipe}
          </button>
        ) : (
          <span />
        )}
        <span className="actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            {t.cancel}
          </button>
          <button type="submit" disabled={saving || !name.trim() || rows.some(loops)}>
            {t.save}
          </button>
        </span>
      </div>
    </form>
  )
}
