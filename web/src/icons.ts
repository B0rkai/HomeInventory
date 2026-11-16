// Emoji icons for items and places. An icon stored on the server wins; null means
// "guess from the name" with the tables below, and an empty string means no icon.

type Entry = [icon: string, keywords: string[]]

// Matched against the name without accents or case. Keywords of up to 3 letters must be
// a whole word ("só" isn't "sör"), 4 letters start a word, longer ones match anywhere
// ("kockacukor"). The first matching entry wins, so specific ones come first.
const ITEMS: Entry[] = [
  ['🧻', ['wc papir', 'wcpapir', 'toalettpapir', 'papirtorlo', 'konyhai papir']],
  ['🤧', ['zsebkendo', 'papirzsebkendo']],
  ['🥛', ['tej', 'tejszin', 'tejfol', 'joghurt', 'kefir']],
  ['🧀', ['sajt', 'turo']],
  ['🧈', ['vaj', 'margarin']],
  ['🥚', ['tojas']],
  ['🍞', ['kenyer', 'zsemle', 'kifli', 'pekaru']],
  ['🍬', ['cukor', 'edesito']],
  ['🧂', ['so', 'bors', 'fuszer']],
  ['🌾', ['liszt', 'zabpehely', 'muzli', 'gabona']],
  ['🍚', ['rizs']],
  ['🍝', ['teszta', 'spagetti']],
  ['🫒', ['olaj', 'olivaolaj', 'ecet']],
  ['🥫', ['konzerv', 'paradicsomszosz', 'passata', 'bab']],
  ['🍯', ['mez', 'lekvar']],
  ['☕', ['kave', 'kapszula']],
  ['🍵', ['tea']],
  ['🍫', ['csoki', 'csokolade', 'kakao']],
  ['🍪', ['keksz', 'ropi', 'chips', 'nasi']],
  ['🍺', ['sor']],
  ['🍷', ['bor', 'pezsgo']],
  ['💧', ['viz', 'asvanyviz', 'szodaviz']],
  ['🧃', ['udito', 'gyumolcsle', 'szorp']],
  ['🥔', ['krumpli', 'burgonya']],
  ['🧅', ['hagyma', 'fokhagyma']],
  ['🍅', ['paradicsom']],
  ['🍎', ['alma', 'gyumolcs']],
  ['🍌', ['banan']],
  ['🥕', ['repa', 'zoldseg']],
  ['🍗', ['csirke', 'hus', 'sonka', 'kolbasz', 'felvagott']],
  ['🧊', ['jeg', 'fagyasztott']],
  ['🧼', ['szappan', 'kezmoso', 'folyekony szappan']],
  ['🧽', ['mosogato', 'szivacs', 'suroló', 'surolo']],
  ['🧺', ['mososzer', 'mosopor', 'mosogel', 'oblito', 'kapszula mosas']],
  ['🧪', ['hipo', 'tisztito', 'fertotlenito', 'vizkooldo', 'ablaktisztito']],
  ['🧴', ['sampon', 'tusfurdo', 'balzsam', 'krem', 'testapolo', 'dezodor']],
  ['🪥', ['fogkrem', 'fogkefe', 'fogselyem', 'szajviz']],
  ['🪒', ['borotva', 'borotvahab']],
  ['🩹', ['sebtapasz', 'kotszer']],
  ['💊', ['gyogyszer', 'vitamin', 'fajdalomcsillapito']],
  ['🧷', ['tisztasagi', 'betet', 'tampon', 'pelenka']],
  ['🗑️', ['szemeteszsak', 'zsak', 'szemetes']],
  ['🔋', ['elem', 'akkumulator']],
  ['💡', ['izzo', 'egő', 'ego']],
  ['🕯️', ['gyertya', 'mecses']],
  ['🐾', ['eledel', 'macskaalom', 'kutyatap', 'macskatap']],
]

const PLACES: Entry[] = [
  ['🚽', ['wc', 'toalett', 'mosdo']],
  ['🛁', ['furdo', 'furdoszoba', 'zuhany']],
  ['🍳', ['konyha']],
  ['🥫', ['spajz', 'kamra']],
  ['🧊', ['huto', 'hutoszekreny']],
  ['❄️', ['fagyaszto', 'fagyasztolada']],
  ['🍽️', ['etkezo', 'ebedlo']],
  ['🛋️', ['nappali']],
  ['🛏️', ['halo', 'haloszoba', 'vendegszoba']],
  ['🧸', ['gyerekszoba', 'gyerek']],
  ['💻', ['dolgozo', 'iroda']],
  ['🧺', ['mosokonyha', 'mosoda', 'mosogep']],
  ['🧱', ['pince', 'alagsor']],
  ['🏚️', ['padlas', 'tetoter']],
  ['🚗', ['garazs']],
  ['🚪', ['eloszoba', 'folyoso', 'hall', 'lepcso']],
  ['🌿', ['kert', 'terasz', 'erkely']],
  ['📦', ['tarolo', 'raktar', 'kamra']],
  ['🗄️', ['szekreny', 'polc', 'fiok']],
  ['🗑️', ['kuka', 'szemetes']],
]

export type IconKind = 'item' | 'place'

const TABLES: Record<IconKind, Entry[]> = { item: ITEMS, place: PLACES }

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
  for (const [icon, keywords] of TABLES[kind]) {
    if (keywords.some((keyword) => matches(normalized, normalize(keyword)))) return icon
  }
  return ''
}

/** The icon to show: the one chosen, else a guess from the name; '' for none. */
export function iconOf(thing: { name: string; icon: string | null }, kind: IconKind): string {
  return thing.icon ?? guessIcon(thing.name, kind)
}

/** The icons the picker offers, in table order. */
export function iconChoices(kind: IconKind): string[] {
  return [...new Set(TABLES[kind].map(([icon]) => icon))]
}
