import type { IngredientIn, IngredientOut, ItemOut, Level, RecipeOut, StockOut } from './api'
import { bestLevel } from './tree'
import { fullName, parseFullName } from './variants'

// An ingredient counts as at home at these; low goes on the list too.
const AT_HOME: Level[] = ['plenty', 'lots']

const fold = (text: string) => text.toLocaleLowerCase('hu')

/** The items an ingredient stands for: the item, or every variant of its name. */
export function ingredientItems(ingredient: IngredientOut, items: ItemOut[]): ItemOut[] {
  const item = items.find((i) => i.id === ingredient.item_id)
  if (!item) return []
  if (!ingredient.any_variant) return [item]
  return items.filter((i) => fold(i.name) === fold(item.name))
}

/** The ingredient's best level anywhere in the house; none when it's kept nowhere. */
export function ingredientLevel(
  ingredient: IngredientOut,
  items: ItemOut[],
  stock: StockOut[],
): Level | undefined {
  const ids = new Set(ingredientItems(ingredient, items).map((item) => item.id))
  return bestLevel(stock.filter((row) => ids.has(row.item_id)))
}

export function atHome(level: Level | undefined): boolean {
  return level !== undefined && AT_HOME.includes(level)
}

/** How many of the ingredients it needs (not the optional ones) aren't at home. */
export function missingCount(recipe: RecipeOut, items: ItemOut[], stock: StockOut[]): number {
  return recipe.ingredients.filter(
    (ingredient) => !ingredient.optional && !atHome(ingredientLevel(ingredient, items, stock)),
  ).length
}

/** How an ingredient reads: "Konzerv · borsó", or just "Konzerv" when any will do. */
export function ingredientText(ingredient: IngredientOut, items: ItemOut[]): string {
  const item = items.find((i) => i.id === ingredient.item_id)
  if (!item) return ''
  return ingredient.any_variant ? item.name : fullName(item)
}

/**
 * An ingredient typed as text ("Konzerv · borsó", "Konzerv"), for the server, which finds
 * or makes the item. A name kept in variants, typed without one, means any of them will do.
 */
export function ingredientFrom(
  text: string,
  items: ItemOut[],
  fields: { amount: string; optional: boolean },
): IngredientIn {
  const { name, variant } = parseFullName(text.trim())
  const variants = items.filter((item) => fold(item.name) === fold(name) && item.variant)
  return {
    name,
    variant,
    any_variant: variant === null && variants.length > 0,
    amount: fields.amount.trim() || null,
    optional: fields.optional,
  }
}

/** Whether an ingredient typed as text is in the catalogue yet (else saving adds it). */
export function knownIngredient(text: string, items: ItemOut[]): boolean {
  const { name, variant } = parseFullName(text.trim())
  return items.some(
    (item) =>
      fold(item.name) === fold(name) &&
      (variant === null || fold(item.variant ?? '') === fold(variant)),
  )
}

// "50 dkg liszt", "liszt 50 dkg", "2 db tojás", "1/2 citrom", "csipet só": an amount is a
// number with an optional unit, or a word like "csipet".
const UNITS = [
  'kg',
  'dkg',
  'g',
  'l',
  'dl',
  'cl',
  'ml',
  'db',
  'darab',
  'ek',
  'evőkanál',
  'evőkanálnyi',
  'kk',
  'teáskanál',
  'kávéskanál',
  'csomag',
  'cs',
  'doboz',
  'fej',
  'gerezd',
  'szál',
  'csokor',
  'bögre',
  'pohár',
  'szelet',
  'marék',
  'konzerv',
  'tasak',
]
const WORDS = ['csipet', 'kevés', 'pár', 'néhány', 'egy', 'fél', 'ízlés szerint', 'ízlés szerinti']
const NUMBER = String.raw`\d+(?:[.,/]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?|½|¼|¾`
const UNIT = UNITS.map((unit) => unit.replace('.', String.raw`\.`)).join('|')
const AMOUNT = new RegExp(
  String.raw`^(?:(?:${NUMBER})\s*(?:(?:${UNIT})\.?(?=\s|$))?|(?:${WORDS.join('|')})(?:\s+(?:${UNIT})\.?(?=\s|$))?)\s*`,
  'iu',
)
const TRAILING = new RegExp(
  String.raw`\s*[,(]?\s*(?:(?:${NUMBER})\s*(?:(?:${UNIT})\.?)?|ízlés szerint)\)?$`,
  'iu',
)

/**
 * Splits a pasted ingredient list into lines of amount and name, each name matched to a
 * catalogue item where one fits (the longest name found in the line), else as typed.
 */
export function parseIngredients(
  pasted: string,
  items: ItemOut[],
): { text: string; amount: string }[] {
  // Longest first, so "Konzerv · borsó" wins over "Konzerv", "vöröshagyma" over "hagyma".
  const byLength = (a: string, b: string) => b.length - a.length
  const names = [...new Set(items.map((item) => item.name))].sort(byLength)
  const variants = items
    .filter((item) => item.variant)
    .sort((a, b) => byLength(a.variant!, b.variant!))
  return pasted
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-–•*·]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .map((line) => {
      let amount = ''
      let rest = line
      const leading = AMOUNT.exec(rest)
      if (leading?.[0].trim()) {
        amount = leading[0].trim()
        rest = rest.slice(leading[0].length)
      } else {
        const trailing = TRAILING.exec(rest)
        if (trailing && trailing.index > 0) {
          amount = trailing[0].replace(/^[\s,(]+|\)$/g, '').trim()
          rest = rest.slice(0, trailing.index)
        }
      }
      rest = rest.replace(/^[\s,:]+|[\s,.;]+$/g, '')
      // A catalogue name inside the line ("finomliszt" has "liszt"; "hagyma, apróra vágva"),
      // or a variant ("1 konzerv borsó": the unit took "konzerv"), its name with it.
      const variant = variants.find((item) => matchesWord(rest, item.variant!))
      const named = names.find((name) => matchesWord(rest, name))
      const found =
        variant && (!named || fold(named) === fold(variant.name)) ? fullName(variant) : named
      const text = found ?? rest.charAt(0).toLocaleUpperCase('hu') + rest.slice(1)
      return { text, amount }
    })
    .filter((line) => line.text)
}

/** Whether `name` appears in `line` as a word or a word's end ("finomliszt" ends in "liszt"),
 * ignoring case and the Hungarian endings a list may add ("hagymát", "tojások"). */
function matchesWord(line: string, name: string): boolean {
  const words = fold(line).split(/[^\p{L}\d-]+/u)
  const wanted = fold(name)
  if (wanted.includes(' ')) return fold(line).includes(wanted)
  return words.some(
    (word) =>
      word === wanted ||
      (wanted.length >= 4 && (word.endsWith(wanted) || stem(word) === stem(wanted))),
  )
}

// Rough: drops a final accusative or plural ending, and lengthens a final a/e back.
function stem(word: string): string {
  return word
    .replace(/(?:ok|ek|ök|ak|at|et|öt|ot|t|k)$/u, '')
    .replace(/á$/u, 'a')
    .replace(/é$/u, 'e')
}
