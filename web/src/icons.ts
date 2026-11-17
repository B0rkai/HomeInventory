// Icons for items, places and chores, by name: Tabler icons (tablerIcons.gen.ts) and our own
// (drawnIcons.ts). An icon stored on the server wins; null means "guess from the name"
// with the tables below, and an empty string means no icon.

/** The group an icon belongs to; each has its own tile colour. */
export type Hue = 'food' | 'drink' | 'clean' | 'body' | 'home' | 'place'

type Entry = [icon: string, hue: Hue, keywords: string[]]

// Matched against the name without accents or case. Keywords of up to 3 letters must be
// a whole word ("só" isn't "sör"), 4 letters start a word, longer ones match anywhere
// ("kockacukor"). The first matching entry wins, so specific ones come first. An empty
// icon stops a word from matching a shorter keyword further down ("borsó" isn't "bors").
const ITEMS: Entry[] = [
  ['toilet-paper', 'body', ['wc papir', 'wcpapir', 'toalettpapir', 'papirtorlo', 'konyhai papir']],
  ['tissue', 'body', ['zsebkendo', 'papirzsebkendo']],
  ['milk', 'food', ['tej', 'tejszin', 'tejfol', 'joghurt', 'kefir']],
  ['cheese', 'food', ['sajt', 'turo']],
  ['butter', 'food', ['vaj', 'margarin']],
  ['egg', 'food', ['tojas']],
  ['bread', 'food', ['kenyer', 'zsemle', 'kifli', 'pekaru']],
  ['sugar', 'food', ['cukor', 'edesito']],
  ['', 'food', ['borso']],
  ['pepper', 'food', ['bors', 'paprika']],
  ['salt', 'food', ['so', 'fuszer']],
  ['wheat', 'food', ['liszt', 'zabpehely', 'muzli', 'gabona']],
  ['bowl-chopsticks', 'food', ['rizs']],
  ['bowl-spoon', 'food', ['teszta', 'spagetti', 'leves']],
  ['bottle', 'food', ['olaj', 'olivaolaj', 'ecet']],
  ['can', 'food', ['konzerv', 'paradicsomszosz', 'passata', 'bab']],
  ['jar', 'food', ['mez', 'lekvar', 'befott']],
  ['coffee', 'drink', ['kave', 'kapszula']],
  ['teapot', 'drink', ['tea']],
  ['mug', 'drink', ['kakao']],
  ['chocolate', 'food', ['csoki', 'csokolade']],
  ['cookie', 'food', ['keksz', 'ropi', 'chips', 'nasi']],
  ['beer', 'drink', ['sor']],
  ['glass-full', 'drink', ['bor', 'pezsgo']],
  ['droplet', 'drink', ['viz', 'asvanyviz', 'szodaviz']],
  ['cup', 'drink', ['udito', 'gyumolcsle', 'szorp']],
  ['potato', 'food', ['krumpli', 'burgonya']],
  ['onion', 'food', ['hagyma', 'fokhagyma']],
  ['tomato', 'food', ['paradicsom']],
  ['apple', 'food', ['alma', 'gyumolcs']],
  ['banana', 'food', ['banan']],
  ['carrot', 'food', ['repa', 'zoldseg']],
  ['sausage', 'food', ['sonka', 'kolbasz', 'felvagott', 'virsli']],
  ['meat', 'food', ['csirke', 'hus']],
  ['ice-cream', 'food', ['jegkrem', 'fagyi']],
  ['fish', 'food', ['lazac', 'hal', 'tonhal', 'pisztrang']],
  ['pizza', 'food', ['pizza']],
  ['snowflake', 'food', ['jeg', 'fagyasztott']],
  ['soap', 'body', ['szappan', 'kezmoso']],
  ['dish-soap', 'clean', ['mosogato']],
  ['sponge', 'clean', ['szivacs', 'surolo']],
  ['wash-machine', 'clean', ['mososzer', 'mosopor', 'mosogel', 'oblito']],
  ['spray', 'clean', ['hipo', 'hypo', 'tisztito', 'fertotlenito', 'vizkooldo']],
  ['hand-sanitizer', 'body', ['sampon', 'tusfurdo', 'balzsam', 'krem', 'testapolo', 'dezodor']],
  ['dental', 'body', ['fogkrem', 'fogkefe', 'fogselyem', 'szajviz']],
  ['razor', 'body', ['borotva']],
  ['bandage', 'body', ['sebtapasz', 'kotszer']],
  ['pill', 'body', ['gyogyszer', 'vitamin', 'fajdalomcsillapito']],
  ['diaper', 'body', ['pelenka', 'popsitorlo']],
  ['trash', 'clean', ['szemeteszsak', 'zsak', 'szemetes']],
  ['battery-2', 'home', ['elem', 'akkumulator']],
  ['bulb', 'home', ['izzo', 'ego']],
  ['candle', 'home', ['gyertya', 'mecses']],
  ['paw', 'home', ['eledel', 'macskaalom', 'kutyatap', 'macskatap']],
]

const PLACES: Entry[] = [
  ['toilet', 'place', ['wc', 'toalett', 'mosdo']],
  ['bath', 'place', ['furdo', 'furdoszoba', 'zuhany']],
  ['tools-kitchen-2', 'place', ['konyha']],
  ['pantry', 'place', ['spajz', 'kamra']],
  ['fridge', 'place', ['huto', 'hutoszekreny']],
  ['snowflake', 'place', ['fagyaszto', 'fagyasztolada']],
  ['tools-kitchen', 'place', ['etkezo', 'ebedlo']],
  ['sofa', 'place', ['nappali']],
  ['bed', 'place', ['halo', 'haloszoba', 'vendegszoba']],
  ['mood-kid', 'place', ['gyerekszoba', 'gyerek']],
  ['desk', 'place', ['dolgozo', 'iroda']],
  ['wash-machine', 'place', ['mosokonyha', 'mosoda', 'mosogep']],
  ['stairs-down', 'place', ['pince', 'alagsor']],
  ['stairs-up', 'place', ['emelet', 'felso']],
  ['home', 'place', ['foldszint']],
  ['attic', 'place', ['padlas', 'tetoter']],
  ['car-garage', 'place', ['garazs']],
  ['door', 'place', ['eloszoba', 'folyoso', 'hall']],
  ['plant-2', 'place', ['kert', 'terasz', 'erkely']],
  ['package', 'place', ['tarolo', 'raktar']],
  ['cabinet', 'place', ['szekreny', 'polc', 'fiok']],
  ['trash', 'place', ['kuka', 'szemetes']],
  // Only offered in the picker: no name guesses it.
  ['badge-wc', 'place', []],
]

const CHORES: Entry[] = [
  ['recycle', 'clean', ['szelektiv', 'muanyag', 'papirgyujto', 'uveg']],
  ['trash', 'clean', ['kuka', 'szemet', 'szemetes']],
  ['bucket', 'clean', ['felmosas']],
  ['vacuum-cleaner', 'clean', ['porszivo', 'porszivozas', 'takaritas', 'portorles']],
  ['window', 'clean', ['ablak']],
  ['tools-kitchen-2', 'clean', ['mosogatas', 'mosogatogep', 'edeny']],
  ['wash-machine', 'clean', ['mosas', 'mosogep']],
  ['hanger', 'clean', ['teregetes', 'ruha']],
  ['ironing', 'clean', ['vasalas']],
  ['bed', 'home', ['agynemu', 'agyhuzat', 'agyazas']],
  ['plant-2', 'home', ['locsolas', 'virag', 'kert', 'funyiras']],
  ['paw', 'home', ['alom', 'etetes', 'kutya', 'macska']],
  ['mailbox', 'home', ['posta', 'levelek']],
  ['bulb', 'home', ['izzo', 'lampa']],
  ['tool', 'home', ['javitas', 'szereles']],
]

/** Icons the app uses outside these tables: the tab bar. */
export const UI_ICONS = ['home', 'list-check', 'shopping-cart', 'clipboard-list']

export type IconKind = 'item' | 'place' | 'chore'

export const ICON_TABLES: Record<IconKind, Entry[]> = { item: ITEMS, place: PLACES, chore: CHORES }

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matches(name: string, keyword: string): boolean {
  if (keyword.length <= 3) return ` ${name} `.includes(` ${keyword} `)
  if (keyword.length === 4) return ` ${name}`.includes(` ${keyword}`)
  return name.includes(keyword)
}

export function guessIcon(name: string, kind: IconKind): string {
  const normalized = normalize(name)
  for (const [icon, , keywords] of ICON_TABLES[kind]) {
    if (keywords.some((keyword) => matches(normalized, normalize(keyword)))) return icon
  }
  return ''
}

/** The tile colour for an icon in this table; a letter tile gets the neutral one. */
export function hueOf(icon: string, kind: IconKind): Hue {
  if (!icon) return 'home'
  return ICON_TABLES[kind].find(([key]) => key === icon)?.[1] ?? 'home'
}

/** The icons the picker offers, in table order. */
export function iconChoices(kind: IconKind): string[] {
  return [...new Set(ICON_TABLES[kind].map(([icon]) => icon).filter(Boolean))]
}

/** Common supplies, offered while adding an item; only the ones picked become items. */
export const COMMON_ITEMS = [
  'WC-papír',
  'Papírtörlő',
  'Zsebkendő',
  'Tej',
  'Tejföl',
  'Joghurt',
  'Sajt',
  'Vaj',
  'Tojás',
  'Kenyér',
  'Cukor',
  'Só',
  'Bors',
  'Liszt',
  'Rizs',
  'Tészta',
  'Olaj',
  'Ecet',
  'Konzerv',
  'Méz',
  'Kávé',
  'Tea',
  'Kakaó',
  'Keksz',
  'Sör',
  'Bor',
  'Ásványvíz',
  'Üdítő',
  'Krumpli',
  'Hagyma',
  'Fokhagyma',
  'Paradicsom',
  'Alma',
  'Banán',
  'Szappan',
  'Mosogatószer',
  'Szivacs',
  'Mosószer',
  'Öblítő',
  'Hypo',
  'Ablaktisztító',
  'Sampon',
  'Tusfürdő',
  'Fogkrém',
  'Borotva',
  'Sebtapasz',
  'Szemeteszsák',
  'Elem',
  'Izzó',
  'Gyertya',
]
