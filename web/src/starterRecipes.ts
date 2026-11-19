import type { ItemOut, RecipeCreate, RecipeKind, RecipeOut } from './api'
import { ingredientFrom, recipeNamed } from './recipes'

// Suggested recipes, offered on the Menu tab and the admin pages; only the ones picked are
// added, and they're the household's own from then on. A main course takes no side dish:
// that's picked when it's planned.

export type StarterIngredient = { text: string; amount?: string; optional?: true; part?: true }
export type Starter = { name: string; kind: RecipeKind; ingredients: StarterIngredient[] }

const item = (text: string, amount?: string): StarterIngredient => ({ text, amount })
const ifAny = (text: string, amount?: string): StarterIngredient => ({
  text,
  amount,
  optional: true,
})
const part = (text: string, amount?: string): StarterIngredient => ({ text, amount, part: true })

export const STARTER_RECIPES: Starter[] = [
  // Base recipes and side dishes first: other recipes take them.
  {
    name: 'Nokedli',
    kind: 'side',
    ingredients: [item('Liszt', '30 dkg'), item('Tojás', '2 db'), item('Só', '1 kk')],
  },
  {
    name: 'Besamel',
    kind: 'base',
    ingredients: [
      item('Vaj', '5 dkg'),
      item('Liszt', '5 dkg'),
      item('Tej', '5 dl'),
      item('Só'),
      ifAny('Szerecsendió', 'csipet'),
    ],
  },
  {
    name: 'Paradicsomszósz',
    kind: 'base',
    ingredients: [
      item('Passzírozott paradicsom', '500 g'),
      item('Hagyma', '1 fej'),
      item('Fokhagyma', '2 gerezd'),
      item('Olaj', '2 ek'),
      item('Cukor', '1 kk'),
      item('Só'),
      ifAny('Bazsalikom'),
    ],
  },
  {
    name: 'Panír',
    kind: 'base',
    ingredients: [item('Liszt', '10 dkg'), item('Tojás', '2 db'), item('Zsemlemorzsa', '15 dkg')],
  },
  {
    name: 'Krumplipüré',
    kind: 'side',
    ingredients: [
      item('Krumpli', '1 kg'),
      item('Tej', '2 dl'),
      item('Vaj', '5 dkg'),
      item('Só'),
      ifAny('Szerecsendió', 'csipet'),
    ],
  },
  {
    name: 'Párolt rizs',
    kind: 'side',
    ingredients: [item('Rizs', '25 dkg'), item('Olaj', '1 ek'), item('Só')],
  },
  {
    name: 'Hasábburgonya',
    kind: 'side',
    ingredients: [item('Krumpli', '1 kg'), item('Olaj', '1 l'), item('Só')],
  },
  {
    name: 'Petrezselymes krumpli',
    kind: 'side',
    ingredients: [
      item('Krumpli', '1 kg'),
      item('Vaj', '3 dkg'),
      item('Petrezselyem', '1 csokor'),
      item('Só'),
    ],
  },
  {
    name: 'Krémleves alap',
    kind: 'base',
    ingredients: [
      item('Hagyma', '1 fej'),
      item('Krumpli', '1 db'),
      item('Vaj', '3 dkg'),
      item('Tejszín', '2 dl'),
      item('Só'),
      item('Bors'),
      ifAny('Szerecsendió', 'csipet'),
    ],
  },
  // Dishes.
  {
    name: 'Paprikás csirke',
    kind: 'main',
    ingredients: [
      item('Csirkecomb', '1 kg'),
      item('Hagyma', '1 fej'),
      item('Pirospaprika', '1 ek'),
      item('Paprika', '1 db'),
      item('Paradicsom', '1 db'),
      item('Tejföl', '2 dl'),
      item('Liszt', '1 ek'),
      item('Olaj', '2 ek'),
      item('Só'),
    ],
  },
  {
    name: 'Marhapörkölt',
    kind: 'main',
    ingredients: [
      item('Marhahús', '1 kg'),
      item('Hagyma', '3 fej'),
      item('Fokhagyma', '2 gerezd'),
      item('Pirospaprika', '2 ek'),
      item('Paprika', '1 db'),
      item('Paradicsom', '1 db'),
      item('Olaj', '3 ek'),
      item('Só'),
      ifAny('Köménymag', '1 kk'),
    ],
  },
  {
    name: 'Gombapaprikás',
    kind: 'main',
    ingredients: [
      item('Gomba', '50 dkg'),
      item('Hagyma', '1 fej'),
      item('Pirospaprika', '1 ek'),
      item('Tejföl', '2 dl'),
      item('Liszt', '1 ek'),
      item('Olaj', '2 ek'),
      item('Só'),
    ],
  },
  {
    name: 'Lecsó',
    kind: 'whole',
    ingredients: [
      item('Paprika', '1 kg'),
      item('Paradicsom', '50 dkg'),
      item('Hagyma', '2 fej'),
      item('Pirospaprika', '1 kk'),
      item('Olaj', '3 ek'),
      item('Só'),
      ifAny('Kolbász', '20 dkg'),
      ifAny('Tojás', '2 db'),
    ],
  },
  {
    name: 'Rakott krumpli',
    kind: 'whole',
    ingredients: [
      item('Krumpli', '1 kg'),
      item('Tojás', '6 db'),
      item('Kolbász', '20 dkg'),
      item('Tejföl', '4 dl'),
      item('Vaj', '3 dkg'),
      item('Só'),
    ],
  },
  {
    name: 'Töltött káposzta',
    kind: 'whole',
    ingredients: [
      item('Savanyú káposzta', '1 kg'),
      item('Darált hús', '50 dkg'),
      item('Rizs', '10 dkg'),
      item('Hagyma', '1 fej'),
      item('Fokhagyma', '2 gerezd'),
      item('Tojás', '1 db'),
      item('Pirospaprika', '1 ek'),
      item('Tejföl', '2 dl'),
      item('Só'),
      item('Bors'),
      ifAny('Füstölt hús', '30 dkg'),
    ],
  },
  {
    name: 'Gulyásleves',
    kind: 'whole',
    ingredients: [
      item('Marhahús', '50 dkg'),
      item('Krumpli', '50 dkg'),
      item('Sárgarépa', '2 db'),
      item('Fehérrépa', '1 db'),
      item('Hagyma', '1 fej'),
      item('Fokhagyma', '2 gerezd'),
      item('Pirospaprika', '1 ek'),
      item('Paprika', '1 db'),
      item('Paradicsom', '1 db'),
      item('Olaj', '2 ek'),
      item('Só'),
      ifAny('Köménymag', '1 kk'),
    ],
  },
  {
    name: 'Húsleves',
    kind: 'whole',
    ingredients: [
      item('Leveshús', '1 kg'),
      item('Sárgarépa', '3 db'),
      item('Fehérrépa', '2 db'),
      item('Zeller', '1 db'),
      item('Hagyma', '1 fej'),
      item('Fokhagyma', '2 gerezd'),
      item('Tészta · cérnametélt', '20 dkg'),
      item('Só'),
      item('Bors'),
      ifAny('Karalábé', '1 db'),
    ],
  },
  {
    name: 'Paradicsomleves',
    kind: 'whole',
    ingredients: [
      item('Passzírozott paradicsom', '700 g'),
      item('Cukor', '2 ek'),
      item('Vaj', '2 dkg'),
      item('Liszt', '1 ek'),
      item('Só'),
      ifAny('Tészta · betűtészta', '10 dkg'),
    ],
  },
  {
    name: 'Bolognai spagetti',
    kind: 'whole',
    ingredients: [
      item('Tészta · spagetti', '50 dkg'),
      item('Darált hús', '50 dkg'),
      item('Hagyma', '1 fej'),
      item('Sárgarépa', '1 db'),
      part('Paradicsomszósz'),
      ifAny('Sajt', '10 dkg'),
    ],
  },
  {
    name: 'Lasagne',
    kind: 'whole',
    ingredients: [
      item('Tészta · lasagne', '25 dkg'),
      item('Darált hús', '50 dkg'),
      item('Hagyma', '1 fej'),
      item('Sajt', '20 dkg'),
      part('Paradicsomszósz'),
      part('Besamel'),
    ],
  },
  {
    name: 'Rántott hús',
    kind: 'main',
    ingredients: [
      item('Sertéskaraj', '60 dkg'),
      item('Olaj', '5 dl'),
      item('Só'),
      part('Panír'),
      ifAny('Citrom', '1 db'),
    ],
  },
  {
    name: 'Tökfőzelék',
    kind: 'whole',
    ingredients: [
      item('Főzőtök', '1 kg'),
      item('Tejföl', '2 dl'),
      item('Liszt', '2 ek'),
      item('Kapor', '1 csokor'),
      item('Ecet', '1 ek'),
      item('Olaj', '2 ek'),
      item('Só'),
    ],
  },
  {
    name: 'Krumplifőzelék',
    kind: 'whole',
    ingredients: [
      item('Krumpli', '1 kg'),
      item('Hagyma', '1 fej'),
      item('Pirospaprika', '1 kk'),
      item('Tejföl', '2 dl'),
      item('Liszt', '2 ek'),
      item('Olaj', '2 ek'),
      item('Só'),
      ifAny('Babérlevél', '2 db'),
      ifAny('Virsli', '4 db'),
    ],
  },
  {
    name: 'Lencsefőzelék',
    kind: 'whole',
    ingredients: [
      item('Lencse', '50 dkg'),
      item('Hagyma', '1 fej'),
      item('Liszt', '2 ek'),
      item('Olaj', '2 ek'),
      item('Ecet', '1 ek'),
      item('Só'),
      ifAny('Babérlevél', '2 db'),
      ifAny('Tejföl', '1 dl'),
    ],
  },
  {
    name: 'Túrós csusza',
    kind: 'whole',
    ingredients: [
      item('Tészta · csusza', '50 dkg'),
      item('Túró', '50 dkg'),
      item('Tejföl', '4 dl'),
      item('Szalonna', '15 dkg'),
      item('Só'),
    ],
  },
  {
    name: 'Palacsinta',
    kind: 'whole',
    ingredients: [
      item('Liszt', '25 dkg'),
      item('Tej', '5 dl'),
      item('Tojás', '2 db'),
      item('Cukor', '1 ek'),
      item('Olaj', '2 ek'),
      item('Só', 'csipet'),
      ifAny('Lekvár'),
      ifAny('Kakaó'),
    ],
  },
  {
    name: 'Rántotta',
    kind: 'whole',
    ingredients: [
      item('Tojás', '4 db'),
      item('Vaj', '2 dkg'),
      item('Só'),
      ifAny('Hagyma', '1 fej'),
    ],
  },
  {
    name: 'Fasírt',
    kind: 'main',
    ingredients: [
      item('Darált hús', '50 dkg'),
      item('Zsemle', '2 db'),
      item('Tej', '1 dl'),
      item('Tojás', '1 db'),
      item('Hagyma', '1 fej'),
      item('Fokhagyma', '2 gerezd'),
      item('Zsemlemorzsa', '10 dkg'),
      item('Olaj', '3 dl'),
      item('Só'),
      item('Bors'),
      ifAny('Majoránna', '1 kk'),
    ],
  },
  {
    name: 'Brokkolikrémleves',
    kind: 'whole',
    ingredients: [item('Brokkoli', '50 dkg'), part('Krémleves alap')],
  },
  {
    name: 'Sütőtökkrémleves',
    kind: 'whole',
    ingredients: [item('Sütőtök', '1 kg'), part('Krémleves alap'), ifAny('Gyömbér')],
  },
  {
    name: 'Gombakrémleves',
    kind: 'whole',
    ingredients: [item('Gomba', '50 dkg'), part('Krémleves alap'), ifAny('Petrezselyem')],
  },
  {
    name: 'Karfiolkrémleves',
    kind: 'whole',
    ingredients: [item('Karfiol', '1 fej'), part('Krémleves alap')],
  },
]

/** The suggestions not added yet (a recipe of the same name counts as added). */
export function startersLeft(recipes: RecipeOut[]): Starter[] {
  return STARTER_RECIPES.filter((starter) => !recipeNamed(starter.name, recipes))
}

/** The suggestions to add for these, in order: the base recipes they take and are not
 * there yet first, each once. */
export function startersWithParts(picked: Starter[], recipes: RecipeOut[]): Starter[] {
  const order: Starter[] = []
  const visit = (starter: Starter) => {
    if (order.includes(starter) || recipeNamed(starter.name, recipes)) return
    for (const ingredient of starter.ingredients) {
      const base = ingredient.part && STARTER_RECIPES.find((s) => s.name === ingredient.text)
      if (base) visit(base)
    }
    order.push(starter)
  }
  picked.forEach(visit)
  return order
}

/** A suggestion as the server takes it. */
export function starterBody(starter: Starter, items: ItemOut[]): RecipeCreate {
  return {
    name: starter.name,
    kind: starter.kind,
    ingredients: starter.ingredients.map((ingredient) =>
      ingredientFrom(ingredient.text, items, ingredient),
    ),
  }
}
