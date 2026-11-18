// A clickable prototype of the meal planner (docs/features.md), on made-up data that
// lives only in this tab. Throwaway: it is here to judge how crowded the pages get.
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Category, Level } from './api'
import { IconArt } from './IconArt'
import { LevelName, LevelPicker } from './LevelPicker'
import { IconTile, Named } from './Named'
import { t } from './strings'
import './MenuProto.css'

type Ingredient = { name: string; amount?: string; optional?: boolean }
type Recipe = { id: number; name: string; icon: string; ingredients: Ingredient[]; note?: string }
type Cooking = { id: number; recipe: number; day: number; cook?: string; done?: boolean }
type Trip = { id: number; day: number; who?: string }
// keeps: how many days before the cooking it may be bought; null: any time.
type Item = {
  name: string
  category: Category
  keeps: number | null
  level: Level | null
  restock: boolean
  where?: string
}
type Data = { items: Item[]; recipes: Recipe[]; cookings: Cooking[]; trips: Trip[]; next: number }

const ME = 'Ákos'
const OTHER = 'Kati'
const AT_HOME: Level[] = ['plenty', 'lots']

const item = (
  name: string,
  category: Category,
  keeps: number | null,
  level: Level | null,
  restock = true,
): Item => ({ name, category, keeps, level, restock, where: level ? 'Kamra' : undefined })

const START: Data = {
  items: [
    item('Hagyma', 'food', 7, 'plenty'),
    item('Paprika', 'food', 7, 'plenty'),
    item('Paradicsom', 'food', 7, 'plenty'),
    item('Kolbász', 'food', 7, 'plenty', false),
    item('Tojás', 'food', 7, 'lots'),
    item('Csirkemell', 'food', 1, null, false),
    item('Pirospaprika', 'food', null, 'low'),
    item('Tejföl', 'food', 7, 'plenty'),
    item('Liszt', 'food', null, 'plenty'),
    item('Petrezselyem', 'food', 7, null, false),
    item('Darált hús', 'food', 1, null, false),
    item('Spagetti', 'food', null, 'plenty'),
    item('Passata', 'food', null, 'out'),
    item('Fokhagyma', 'food', 7, 'plenty'),
    item('Sajt', 'food', 7, 'low'),
    item('Tej', 'drink', 7, 'plenty'),
    item('Cukor', 'food', null, 'lots'),
    item('Sertéskaraj', 'food', 1, null, false),
    item('Zsemlemorzsa', 'food', null, 'plenty'),
    item('Étolaj', 'food', null, 'plenty'),
    item('WC-papír', 'body', null, 'low'),
    item('Mosogatószer', 'clean', null, 'out'),
  ],
  recipes: [
    {
      id: 1,
      name: 'Lecsó',
      icon: 'pepper',
      ingredients: [
        { name: 'Paprika', amount: '1 kg' },
        { name: 'Paradicsom', amount: '50 dkg' },
        { name: 'Hagyma', amount: '2 fej' },
        { name: 'Kolbász', amount: '20 dkg', optional: true },
        { name: 'Tojás', amount: '4 db' },
      ],
    },
    {
      id: 2,
      name: 'Paprikás csirke',
      icon: 'meat',
      ingredients: [
        { name: 'Csirkemell', amount: '1 kg' },
        { name: 'Hagyma', amount: '2 fej' },
        { name: 'Pirospaprika', amount: '2 ek' },
        { name: 'Tejföl', amount: '2 dl' },
        { name: 'Liszt', amount: '1 ek' },
        { name: 'Petrezselyem', optional: true },
      ],
      note: 'Nokedlivel. A tejfölt a végén, ne forralja fel.',
    },
    {
      id: 3,
      name: 'Bolognai',
      icon: 'bowl-spoon',
      ingredients: [
        { name: 'Darált hús', amount: '50 dkg' },
        { name: 'Spagetti', amount: '50 dkg' },
        { name: 'Passata', amount: '1 üveg' },
        { name: 'Hagyma', amount: '1 fej' },
        { name: 'Fokhagyma', amount: '3 gerezd' },
        { name: 'Sajt', amount: 'a tetejére', optional: true },
      ],
    },
    {
      id: 4,
      name: 'Palacsinta',
      icon: 'egg',
      ingredients: [
        { name: 'Liszt', amount: '25 dkg' },
        { name: 'Tej', amount: '5 dl' },
        { name: 'Tojás', amount: '3 db' },
        { name: 'Cukor', amount: '1 ek' },
      ],
    },
    {
      id: 5,
      name: 'Rántott hús',
      icon: 'meat',
      ingredients: [
        { name: 'Sertéskaraj', amount: '80 dkg' },
        { name: 'Liszt' },
        { name: 'Tojás', amount: '3 db' },
        { name: 'Zsemlemorzsa' },
        { name: 'Étolaj' },
      ],
    },
  ],
  cookings: [
    { id: 1, recipe: 1, day: 1, cook: OTHER },
    { id: 2, recipe: 2, day: 3 },
  ],
  trips: [{ id: 1, day: 0, who: ME }],
  next: 10,
}

const STORE_KEY = 'menu-proto'

// ---- days: offsets from today ----

const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat']
const FROM = [
  'vasárnaptól',
  'hétfőtől',
  'keddtől',
  'szerdától',
  'csütörtöktől',
  'péntektől',
  'szombattól',
]
const FOR = ['vasárnapra', 'hétfőre', 'keddre', 'szerdára', 'csütörtökre', 'péntekre', 'szombatra']
const ADJ = ['vasárnapi', 'hétfői', 'keddi', 'szerdai', 'csütörtöki', 'pénteki', 'szombati']

const date = (day: number) => {
  const d = new Date()
  d.setDate(d.getDate() + day)
  return d
}
const weekday = (day: number) => date(day).getDay()
const cap = (text: string) => text.charAt(0).toLocaleUpperCase('hu') + text.slice(1)
const dayName = (day: number) => (day === 0 ? 'ma' : day === 1 ? 'holnap' : WEEKDAYS[weekday(day)])
const dayFrom = (day: number) => (day <= 0 ? 'most' : day === 1 ? 'holnaptól' : FROM[weekday(day)])
const dayFor = (day: number) => (day === 0 ? 'mára' : day === 1 ? 'holnapra' : FOR[weekday(day)])
const dayAdj = (day: number) => (day === 0 ? 'mai' : day === 1 ? 'holnapi' : ADJ[weekday(day)])
const shortDate = (day: number) =>
  date(day).toLocaleDateString('hu', { month: 'short', day: 'numeric' })

// ---- what the plan means for the list ----

type Line = {
  key: string
  item: Item
  from: number
  to: number // Infinity: a plain shortage, no cooking waits for it
  cookings: Cooking[]
  trip?: Trip
}

function recipeOf(data: Data, cooking: Cooking) {
  return data.recipes.find((r) => r.id === cooking.recipe)!
}

function itemOf(data: Data, name: string) {
  return data.items.find((i) => i.name === name)!
}

const atHome = (item: Item) => item.level !== null && AT_HOME.includes(item.level)

function planned(data: Data) {
  return data.cookings.filter((c) => !c.done).sort((a, b) => a.day - b.day)
}

function linesOf(data: Data): Line[] {
  const lines = new Map<string, Line>()
  // Restocked items that ran low are on the list anyway.
  for (const item of data.items) {
    if (item.restock && (item.level === 'low' || item.level === 'out'))
      lines.set(item.name, { key: item.name, item, from: 0, to: Infinity, cookings: [] })
  }
  for (const cooking of planned(data)) {
    for (const ing of recipeOf(data, cooking).ingredients) {
      const item = itemOf(data, ing.name)
      if (ing.optional || atHome(item)) continue
      const from = item.keeps === null ? 0 : Math.max(0, cooking.day - item.keeps)
      const line = lines.get(item.name)
      // One line an item, unless its windows don't meet (meat for two days).
      if (line && line.from <= cooking.day && from <= line.to) {
        line.from = Math.max(line.from, from)
        line.to = Math.min(line.to, cooking.day)
        line.cookings.push(cooking)
      } else {
        const key = line ? `${item.name}-${cooking.id}` : item.name
        lines.set(key, { key, item, from, to: cooking.day, cookings: [cooking] })
      }
    }
  }
  const trips = [...data.trips].sort((a, b) => a.day - b.day)
  for (const line of lines.values()) {
    const fits = trips.filter((trip) => trip.day >= line.from && trip.day <= line.to)
    // Durable: the first trip that can; fresh: the last, so it's freshest.
    line.trip = line.item.keeps === null ? fits[0] : fits.at(-1)
  }
  return [...lines.values()]
}

/** The fewest days that cover the lines no trip covers: the day before the earliest deadline. */
function suggestions(lines: Line[]): { day: number; lines: Line[] }[] {
  let open = lines.filter((line) => !line.trip && line.to !== Infinity)
  const days = []
  while (open.length) {
    const first = open.reduce((a, b) => (b.to < a.to ? b : a))
    const day = Math.max(first.from, first.to - 1)
    const covered = open.filter((line) => line.from <= day && day <= line.to)
    days.push({ day, lines: covered })
    open = open.filter((line) => !covered.includes(line))
  }
  return days.sort((a, b) => a.day - b.day)
}

function cookingStatus(cooking: Cooking, lines: Line[]) {
  const mine = lines.filter((line) => line.cookings.includes(cooking))
  if (!mine.length) return { tone: 'ok', text: '✓ minden megvan' }
  const uncovered = mine.filter((line) => !line.trip)
  if (uncovered.length)
    return {
      tone: 'out',
      text: `⚠ ${uncovered.map((l) => l.item.name).join(', ')}: nincs rá bevásárlás`,
    }
  const trips = [...new Set(mine.map((line) => line.trip!))]
  return {
    tone: 'low',
    text: `${mine.length} hiányzik · ${trips.map((trip) => dayAdj(trip.day)).join(', ')} bevásárlás`,
  }
}

// ---- routing inside the prototype: #/proto/<path> ----

function usePath(): string[] {
  const hash = useSyncExternalStore(
    (on) => {
      window.addEventListener('hashchange', on)
      return () => window.removeEventListener('hashchange', on)
    },
    () => window.location.hash,
  )
  return hash
    .replace(/^#\/proto\/?/, '')
    .split('/')
    .filter(Boolean)
}

const go = (path: string) => (window.location.hash = `#/proto/${path}`)
const swap = (path: string) => window.location.replace(`#/proto/${path}`)

type Props = { data: Data; set: (change: (data: Data) => Data) => void }

export function MenuProto() {
  const [data, setData] = useState<Data>(() => {
    try {
      const saved = sessionStorage.getItem(STORE_KEY)
      return saved ? (JSON.parse(saved) as Data) : START
    } catch {
      return START
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(data))
    } catch {
      // Only a convenience.
    }
  }, [data])
  const set = (change: (data: Data) => Data) => setData((d) => change(d))
  const path = usePath()
  const [page = 'menu', arg] = path
  const props = { data, set }
  const tab = ['recipes', 'plan', 'cooking', 'left', 'recipe', 'edit'].includes(page)
    ? 'menu'
    : page

  return (
    <>
      <div className="offline-bar proto-bar">
        Prototípus: kitalált adatok, semmi nem mentődik.{' '}
        <button
          type="button"
          className="secondary small-button"
          onClick={() => {
            setData(START)
            swap('menu')
          }}
        >
          Újrakezd
        </button>
      </div>
      {page === 'menu' && <Week {...props} />}
      {page === 'recipes' && <Recipes {...props} />}
      {page === 'plan' && <Plan {...props} recipeId={arg ? Number(arg) : undefined} />}
      {page === 'cooking' && <CookingPage {...props} id={Number(arg)} />}
      {page === 'left' && <Leftovers {...props} id={Number(arg)} />}
      {page === 'recipe' && <RecipePage {...props} id={Number(arg)} />}
      {page === 'edit' && <RecipeEdit {...props} id={arg ? Number(arg) : undefined} />}
      {page === 'todo' && <Shopping {...props} tripArg={arg} />}
      {page === 'items' && <Catalogue {...props} />}
      {(page === 'places' || page === 'log') && (
        <div className="card">
          <p>
            Ez a lap nem változik; a prototípus a Menüt, a bevásárlólistát és a Termékeket mutatja.
          </p>
          <p>
            <a href="#/">Vissza a rendes appba</a>
          </p>
        </div>
      )}
      <nav className="tabbar">
        {[
          ['places', 'home', t.nav.places],
          ['todo', 'list-check', t.nav.todo],
          ['menu', 'chef-hat', 'Menü'],
          ['items', 'clipboard-list', t.nav.items],
          ['log', 'history', t.nav.log],
        ].map(([key, icon, label]) => (
          <a key={key} href={`#/proto/${key}`} aria-current={tab === key ? 'page' : undefined}>
            <span className="tab-icon" aria-hidden="true">
              <IconArt name={icon} />
              {key === 'todo' && <span className="tab-count">{linesOf(data).length}</span>}
            </span>
            {label}
          </a>
        ))}
      </nav>
    </>
  )
}

function MenuTabs({ current }: { current: 'menu' | 'recipes' }) {
  return (
    <div className="tabs" role="tablist">
      {(
        [
          ['menu', 'A hét'],
          ['recipes', 'Receptek'],
        ] as const
      ).map(([key, label]) => (
        <a
          key={key}
          role="tab"
          aria-selected={current === key}
          href={`#/proto/${key}`}
          onClick={(event) => {
            event.preventDefault()
            swap(key)
          }}
        >
          {label}
        </a>
      ))}
    </div>
  )
}

function RecipeTile({ recipe }: { recipe: Recipe }) {
  return (
    <span className="named">
      <IconTile icon={recipe.icon} name={recipe.name} kind="item" hue="food" />
      <span>{recipe.name}</span>
    </span>
  )
}

function DayChips({ day, onPick }: { day?: number; onPick: (day: number) => void }) {
  return (
    <div className="group-tabs" role="tablist" aria-label="Nap">
      {Array.from({ length: 10 }, (_, d) => (
        <button
          key={d}
          type="button"
          role="tab"
          className="chip"
          aria-selected={day === d}
          onClick={() => onPick(d)}
        >
          {d < 2
            ? cap(dayName(d))
            : `${cap(WEEKDAYS[weekday(d)])}${d >= 7 ? ` ${shortDate(d)}` : ''}`}
        </button>
      ))}
    </div>
  )
}

// ---- Menü: the week ----

function Week({ data, set }: Props) {
  const lines = linesOf(data)
  const cookings = planned(data)
  const days = [...new Set([...cookings.map((c) => c.day), ...data.trips.map((t) => t.day)])].sort(
    (a, b) => a - b,
  )
  const [addingTrip, setAddingTrip] = useState(false)
  const addTrip = (day: number) =>
    set((d) => ({ ...d, trips: [...d.trips, { id: d.next, day }], next: d.next + 1 }))

  return (
    <>
      <h2>Menü</h2>
      <MenuTabs current="menu" />
      <Suggestions lines={lines} onAdd={addTrip} />
      {days.length === 0 && (
        <div className="card">
          <p>Nincs betervezett főzés.</p>
        </div>
      )}
      {days.map((day) => (
        <section key={day} className="card agenda-day">
          <h3>
            {cap(dayName(day))} · {shortDate(day)}
          </h3>
          <ul>
            {data.trips
              .filter((trip) => trip.day === day)
              .map((trip) => {
                const count = lines.filter((line) => line.trip === trip).length
                return (
                  <li key={`t${trip.id}`}>
                    <a className="agenda-row" href={`#/proto/todo/${trip.id}`}>
                      <span className="named">
                        <IconTile icon="shopping-cart" name="Bevásárlás" kind="item" hue="home" />
                        <span>Bevásárlás</span>
                      </span>
                      <span className="small muted">{count} tétel</span>
                    </a>
                    <Who
                      who={trip.who}
                      onClaim={(who) =>
                        set((d) => ({
                          ...d,
                          trips: d.trips.map((x) => (x.id === trip.id ? { ...x, who } : x)),
                        }))
                      }
                      role="megy"
                    />
                  </li>
                )
              })}
            {cookings
              .filter((cooking) => cooking.day === day)
              .map((cooking) => {
                const status = cookingStatus(cooking, lines)
                return (
                  <li key={`c${cooking.id}`}>
                    <a className="agenda-row" href={`#/proto/cooking/${cooking.id}`}>
                      <RecipeTile recipe={recipeOf(data, cooking)} />
                      <span className="small muted">
                        {cooking.cook ? `${cooking.cook} főz` : ''}
                      </span>
                    </a>
                    <p className={`small agenda-status ${status.tone}`}>{status.text}</p>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
      <div className="actions one-off-toggle">
        <button type="button" className="secondary small-button" onClick={() => go('plan')}>
          + Főzés
        </button>
        <button
          type="button"
          className="secondary small-button"
          onClick={() => setAddingTrip(!addingTrip)}
        >
          + Bevásárlás
        </button>
      </div>
      {addingTrip && (
        <div className="card">
          <h3>Bevásárlás napja</h3>
          <DayChips
            onPick={(day) => {
              addTrip(day)
              setAddingTrip(false)
            }}
          />
        </div>
      )}
    </>
  )
}

function Who({
  who,
  onClaim,
  role,
}: {
  who?: string
  onClaim: (who?: string) => void
  role: string
}) {
  if (who === ME)
    return (
      <p className="small agenda-who">
        <span className="claim">Te {role === 'megy' ? 'mész' : 'főzöl'}</span>
        <button type="button" className="secondary small-button" onClick={() => onClaim()}>
          Mégsem
        </button>
      </p>
    )
  if (who)
    return (
      <p className="small agenda-who muted">
        {who} {role}
      </p>
    )
  return (
    <p className="small agenda-who">
      <span className="muted">Még senki</span>
      <button type="button" className="secondary small-button" onClick={() => onClaim(ME)}>
        Elvállalom
      </button>
    </p>
  )
}

function Suggestions({ lines, onAdd }: { lines: Line[]; onAdd: (day: number) => void }) {
  return (
    <>
      {suggestions(lines).map((s) => (
        <div key={s.day} className="card suggestion">
          <p>
            <strong>Javasolt bevásárlás: {dayName(s.day)}</strong>
            <br />
            <span className="small muted">
              {s.lines
                .map(
                  (line) =>
                    `${line.item.name} (${line.cookings.map((c) => dayFor(c.day)).join(', ')})`,
                )
                .join(', ')}
            </span>
          </p>
          <button type="button" className="small-button" onClick={() => onAdd(s.day)}>
            Felvesz
          </button>
        </div>
      ))}
    </>
  )
}

// ---- planning a cooking ----

function Plan({ data, set, recipeId }: Props & { recipeId?: number }) {
  const [search, setSearch] = useState('')
  const [day, setDay] = useState<number>()
  const recipe = data.recipes.find((r) => r.id === recipeId)

  if (!recipe) {
    const found = data.recipes.filter((r) =>
      r.name.toLocaleLowerCase('hu').includes(search.toLocaleLowerCase('hu')),
    )
    return (
      <>
        <BackLink to="menu" />
        <h2>Mit főzünk?</h2>
        <input
          className="search"
          placeholder="Recept keresése"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="card">
          <ul className="item-list">
            {found.map((r) => (
              <li key={r.id}>
                <a className="item-row" href={`#/proto/plan/${r.id}`}>
                  <RecipeTile recipe={r} />
                  <span className="small muted">{r.ingredients.length} hozzávaló</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="actions one-off-toggle">
          <button type="button" className="secondary small-button" onClick={() => go('edit')}>
            + Új recept
          </button>
        </div>
      </>
    )
  }

  // What planning it would do, before it's done.
  const draft: Cooking = { id: -1, recipe: recipe.id, day: day ?? 0 }
  const trial = { ...data, cookings: [...data.cookings, draft] }
  const lines = day === undefined ? [] : linesOf(trial).filter((l) => l.cookings.includes(draft))
  const home = recipe.ingredients.filter((i) => !i.optional && atHome(itemOf(data, i.name)))

  return (
    <>
      <BackLink to="plan" />
      <h2>
        <RecipeTile recipe={recipe} />
      </h2>
      <div className="card">
        <h3>Melyik napra?</h3>
        <DayChips day={day} onPick={setDay} />
      </div>
      {day !== undefined && (
        <div className="card preview">
          {home.length > 0 && (
            <p className="small">
              <span className="ok">✓</span> Otthon van: {home.map((i) => i.name).join(', ')}
            </p>
          )}
          {lines.map((line) => (
            <p key={line.key} className="small">
              <span className="low">+</span> {line.item.name} listára,{' '}
              {line.from > 0 ? dayFrom(line.from) : 'most'}
              {line.trip ? (
                <span className="muted"> · {dayAdj(line.trip.day)} bevásárlás</span>
              ) : (
                <span className="out"> · nincs rá bevásárlás</span>
              )}
            </p>
          ))}
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                set((d) => ({
                  ...d,
                  cookings: [...d.cookings, { id: d.next, recipe: recipe.id, day }],
                  next: d.next + 1,
                }))
                go('menu')
              }}
            >
              Betervez
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function BackLink({ to }: { to: string }) {
  return (
    <nav className="crumbs">
      <a href={`#/proto/${to}`} onClick={(e) => (e.preventDefault(), history.back())}>
        ←
      </a>
    </nav>
  )
}

// ---- one cooking ----

function CookingPage({ data, set, id }: Props & { id: number }) {
  const [moving, setMoving] = useState(false)
  const cooking = data.cookings.find((c) => c.id === id)
  if (!cooking) return <BackLink to="menu" />
  const recipe = recipeOf(data, cooking)
  const lines = linesOf(data)
  const change = (patch: Partial<Cooking>) =>
    set((d) => ({ ...d, cookings: d.cookings.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))

  return (
    <>
      <BackLink to="menu" />
      <div className="title-row">
        <h2>
          <RecipeTile recipe={recipe} />
        </h2>
        <a className="small" href={`#/proto/recipe/${recipe.id}`}>
          Recept
        </a>
      </div>
      <div className="card">
        <p>
          <strong>
            {cap(dayName(cooking.day))} · {shortDate(cooking.day)}
          </strong>
        </p>
        <Who who={cooking.cook} onClaim={(cook) => change({ cook })} role="főz" />
      </div>
      <section className="card">
        <h3>Hozzávalók</h3>
        <ul className="item-list">
          {recipe.ingredients.map((ing) => {
            const it = itemOf(data, ing.name)
            const line = lines.find((l) => l.item === it && l.cookings.includes(cooking))
            return (
              <li key={ing.name} className="item-row">
                <span>
                  <Named thing={{ name: it.name, icon: null, category: it.category }} kind="item" />
                  {ing.amount && <span className="small muted"> · {ing.amount}</span>}
                </span>
                <span className="small">
                  {ing.optional ? (
                    <span className="muted">ha van</span>
                  ) : line ? (
                    line.trip ? (
                      <span className="low">listán · {dayAdj(line.trip.day)} bevásárlás</span>
                    ) : (
                      <span className="out">nincs rá bevásárlás</span>
                    )
                  ) : (
                    <LevelName level={it.level!} />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
      {moving && (
        <div className="card">
          <h3>Melyik napra?</h3>
          <DayChips
            day={cooking.day}
            onPick={(day) => {
              change({ day })
              setMoving(false)
            }}
          />
        </div>
      )}
      <div className="actions one-off-toggle">
        <button
          type="button"
          className="danger"
          onClick={() => {
            set((d) => ({ ...d, cookings: d.cookings.filter((c) => c.id !== id) }))
            history.back()
          }}
        >
          Lemond
        </button>
        <button type="button" className="secondary" onClick={() => setMoving(!moving)}>
          Áthelyez
        </button>
        <button type="button" onClick={() => swap(`left/${id}`)}>
          Megfőztem
        </button>
      </div>
    </>
  )
}

function Leftovers({ data, set, id }: Props & { id: number }) {
  const cooking = data.cookings.find((c) => c.id === id)!
  const recipe = recipeOf(data, cooking)
  const used = recipe.ingredients
    .map((ing) => itemOf(data, ing.name))
    .filter((it) => it.level !== null)
  const [levels, setLevels] = useState(() => new Map(used.map((it) => [it.name, it.level!])))
  return (
    <>
      <h2>Mi maradt?</h2>
      <p className="muted small">{recipe.name}: állítsd be, ami elfogyott vagy kevés lett.</p>
      <section className="card">
        <ul className="stock">
          {used.map((it) => (
            <li key={it.name}>
              <div className="stock-name">
                <Named thing={{ name: it.name, icon: null, category: it.category }} kind="item" />
              </div>
              <LevelPicker
                level={levels.get(it.name)!}
                label={it.name}
                onChange={(level) => setLevels(new Map(levels).set(it.name, level))}
              />
            </li>
          ))}
        </ul>
      </section>
      <div className="actions one-off-toggle">
        <button
          type="button"
          onClick={() => {
            set((d) => ({
              ...d,
              items: d.items.map((it) =>
                levels.has(it.name) ? { ...it, level: levels.get(it.name)! } : it,
              ),
              cookings: d.cookings.map((c) => (c.id === id ? { ...c, done: true } : c)),
            }))
            swap('menu')
          }}
        >
          Kész
        </button>
      </div>
    </>
  )
}

// ---- recipes ----

function Recipes({ data }: Props) {
  const [search, setSearch] = useState('')
  const found = data.recipes.filter((r) =>
    r.name.toLocaleLowerCase('hu').includes(search.toLocaleLowerCase('hu')),
  )
  return (
    <>
      <h2>Menü</h2>
      <MenuTabs current="recipes" />
      <input
        className="search"
        placeholder="Recept keresése"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="card">
        <ul className="item-list">
          {found.map((r) => {
            const missing = r.ingredients.filter(
              (i) => !i.optional && !atHome(itemOf(data, i.name)),
            ).length
            return (
              <li key={r.id}>
                <a className="item-row" href={`#/proto/recipe/${r.id}`}>
                  <RecipeTile recipe={r} />
                  <span className="small muted">
                    {missing ? `${missing} hiányzik` : <span className="ok">minden megvan</span>}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="actions one-off-toggle">
        <button type="button" className="secondary small-button" onClick={() => go('edit')}>
          + Új recept
        </button>
      </div>
    </>
  )
}

function RecipePage({ data, id }: Props & { id: number }) {
  const recipe = data.recipes.find((r) => r.id === id)
  if (!recipe) return <BackLink to="recipes" />
  return (
    <>
      <BackLink to="recipes" />
      <div className="title-row">
        <h2>
          <RecipeTile recipe={recipe} />
        </h2>
        <button type="button" className="secondary" onClick={() => go(`edit/${id}`)}>
          {t.edit}
        </button>
      </div>
      <section className="card">
        <h3>Hozzávalók</h3>
        <ul className="item-list">
          {recipe.ingredients.map((ing) => {
            const it = itemOf(data, ing.name)
            return (
              <li key={ing.name} className="item-row">
                <span>
                  <Named thing={{ name: it.name, icon: null, category: it.category }} kind="item" />
                  {ing.amount && <span className="small muted"> · {ing.amount}</span>}
                </span>
                <span className="small">
                  {ing.optional ? (
                    <span className="muted">ha van</span>
                  ) : it.level ? (
                    <LevelName level={it.level} />
                  ) : (
                    <span className="muted">nincs itthon</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        {recipe.note && <p className="small muted recipe-note">{recipe.note}</p>}
      </section>
      <div className="actions one-off-toggle">
        <button type="button" onClick={() => go(`plan/${id}`)}>
          Betervez
        </button>
      </div>
    </>
  )
}

function RecipeEdit({ data, set, id }: Props & { id?: number }) {
  const old = data.recipes.find((r) => r.id === id)
  const [name, setName] = useState(old?.name ?? '')
  const [ings, setIngs] = useState<Ingredient[]>(old?.ingredients ?? [])
  const [note, setNote] = useState(old?.note ?? '')
  const [adding, setAdding] = useState('')
  const change = (i: number, patch: Partial<Ingredient>) =>
    setIngs(ings.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)))

  function add() {
    const typed = adding.trim()
    if (!typed) return
    if (!data.items.some((it) => it.name === typed))
      set((d) => ({ ...d, items: [...d.items, item(typed, 'food', 7, null, false)] }))
    setIngs([...ings, { name: typed }])
    setAdding('')
  }

  return (
    <>
      <BackLink to="recipes" />
      <h2>{old ? old.name : 'Új recept'}</h2>
      <div className="card item-form">
        <label>
          Név
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="pl. Lecsó" />
        </label>
        <div>
          <h3>Hozzávalók</h3>
          <ul className="ingredients">
            {ings.map((ing, i) => (
              <li key={i}>
                <span className="ing-name">{ing.name}</span>
                <input
                  aria-label="Mennyiség"
                  placeholder="mennyi?"
                  value={ing.amount ?? ''}
                  onChange={(e) => change(i, { amount: e.target.value })}
                />
                <label className="ing-optional">
                  <input
                    type="checkbox"
                    checked={!!ing.optional}
                    onChange={(e) => change(i, { optional: e.target.checked })}
                  />
                  ha van
                </label>
                <button
                  type="button"
                  className="icon"
                  aria-label="Törlés"
                  onClick={() => setIngs(ings.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form
            className="add-form"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <div className="row">
              <input
                list="proto-items"
                placeholder="Hozzávaló, pl. Hagyma"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
              />
              <button type="submit" disabled={!adding.trim()}>
                {t.add}
              </button>
            </div>
            <datalist id="proto-items">
              {data.items.map((it) => (
                <option key={it.name} value={it.name} />
              ))}
            </datalist>
          </form>
        </div>
        <label>
          Megjegyzés
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="nem kötelező"
          />
        </label>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => history.back()}>
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              const recipe: Recipe = {
                id: old?.id ?? data.next,
                name: name.trim(),
                icon: old?.icon ?? '',
                ingredients: ings,
                note: note || undefined,
              }
              set((d) => ({
                ...d,
                recipes: old
                  ? d.recipes.map((r) => (r.id === old.id ? recipe : r))
                  : [...d.recipes, recipe],
                next: old ? d.next : d.next + 1,
              }))
              swap(`recipe/${recipe.id}`)
            }}
          >
            {t.save}
          </button>
        </div>
      </div>
    </>
  )
}

// ---- the shopping list, by trip ----

const CATEGORY_NAMES: Record<Category, string> = t.categories

function Shopping({ data, set, tripArg }: Props & { tripArg?: string }) {
  const lines = linesOf(data)
  const trips = [...data.trips].sort((a, b) => a.day - b.day)
  const later = lines.filter((l) => !l.trip && l.from > 0)
  const loose = lines.filter((l) => !l.trip && l.from === 0)
  const tabs: { key: string; label: string; lines: Line[]; trip?: Trip }[] = [
    ...trips.map((trip) => ({
      key: String(trip.id),
      label: cap(dayName(trip.day)),
      lines: lines.filter((l) => l.trip === trip),
      trip,
    })),
    ...(loose.length ? [{ key: 'loose', label: 'Nincs beosztva', lines: loose }] : []),
    ...(later.length ? [{ key: 'later', label: 'Később', lines: later }] : []),
  ]
  const current = tabs.find((tab) => tab.key === tripArg) ?? tabs[0]
  const bought = (line: Line) =>
    set((d) => ({
      ...d,
      items: d.items.map((it) => (it.name === line.item.name ? { ...it, level: 'plenty' } : it)),
    }))
  const byCategory = (list: Line[]) =>
    (['food', 'drink', 'clean', 'body', 'home'] as Category[])
      .map((c) => [c, list.filter((l) => l.item.category === c)] as const)
      .filter(([, list]) => list.length)

  return (
    <>
      <h2>{t.todo.title}</h2>
      <div className="tabs" role="tablist">
        <a role="tab" aria-selected="true" href="#/proto/todo">
          {t.todo.pool}
          <span className="tab-badge">{lines.length}</span>
        </a>
        <a role="tab" aria-selected="false" href="#/proto/todo">
          {t.todo.mineTab}
        </a>
      </div>
      {/* With no trip planned, the list is as it is today: no trip chips. */}
      {data.trips.length > 0 && (
        <div className="group-tabs trip-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              className="chip"
              aria-selected={tab === current}
              onClick={() => swap(`todo/${tab.key}`)}
            >
              {tab.label} <span className="tab-badge">{tab.lines.length}</span>
            </button>
          ))}
        </div>
      )}
      {current && (
        <section className="card">
          <div className="section-head">
            <h3>
              {current.trip
                ? `${cap(dayAdj(current.trip.day))} bevásárlás`
                : current.key === 'later'
                  ? 'Még korai megvenni'
                  : t.todo.shopping}
            </h3>
            {current.trip && (
              <span className="small">
                {current.trip.who ? (
                  <span className="claim">
                    {current.trip.who === ME ? 'Te mész' : `${current.trip.who} megy`}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="secondary small-button"
                    onClick={() =>
                      set((d) => ({
                        ...d,
                        trips: d.trips.map((x) =>
                          x.id === current.trip!.id ? { ...x, who: ME } : x,
                        ),
                      }))
                    }
                  >
                    Megyek
                  </button>
                )}
              </span>
            )}
          </div>
          {current.key === 'loose' && (
            <Suggestions
              lines={lines}
              onAdd={(day) =>
                set((d) => ({ ...d, trips: [...d.trips, { id: d.next, day }], next: d.next + 1 }))
              }
            />
          )}
          {byCategory(current.lines).map(([category, list]) => (
            <div key={category}>
              <div className="section-head category-head">
                <h4>{CATEGORY_NAMES[category]}</h4>
              </div>
              <ul className="requests">
                {list.map((line) => (
                  <li key={line.key} className={current.key === 'later' ? 'not-yet' : undefined}>
                    <div className="request-head">
                      <Named
                        thing={{ name: line.item.name, icon: null, category: line.item.category }}
                        kind="item"
                      />
                    </div>
                    <div className="request-body">
                      <div className="request-info">
                        <p className="small muted">
                          {line.cookings.length > 0 ? (
                            <>
                              <IconArt name="chef-hat" />{' '}
                              {line.cookings
                                .map((c) => `${recipeOf(data, c).name}, ${dayFor(c.day)}`)
                                .join(' · ')}
                            </>
                          ) : (
                            <>
                              <LevelName level={line.item.level!} /> · {line.item.where}
                            </>
                          )}
                          {current.key === 'later' && <> · {dayFrom(line.from)}</>}
                        </p>
                      </div>
                      {current.key !== 'later' && (
                        <div className="request-actions">
                          <button
                            type="button"
                            className="small-button"
                            onClick={() => bought(line)}
                          >
                            ✓ Megvettem
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {current.lines.length === 0 && <p className="muted">Erre az útra nincs semmi.</p>}
        </section>
      )}
      {!current && (
        <div className="card">
          <p>{t.todo.none}</p>
        </div>
      )}
    </>
  )
}

// ---- the catalogue, with the shortages merged in ----

function Catalogue({ data }: Props) {
  const [missingOnly, setMissingOnly] = useState(false)
  const reserved = new Map<string, Cooking>()
  for (const cooking of planned(data))
    for (const ing of recipeOf(data, cooking).ingredients)
      if (!reserved.has(ing.name) && atHome(itemOf(data, ing.name))) reserved.set(ing.name, cooking)
  const shown = data.items
    .filter((it) => !missingOnly || it.level === 'low' || it.level === 'out')
    .filter((it) => it.level !== null || !missingOnly)
  const groups = (['food', 'drink', 'clean', 'body', 'home'] as Category[])
    .map((c) => [c, shown.filter((it) => it.category === c)] as const)
    .filter(([, list]) => list.length)
  const order: Record<string, number> = { lots: 0, plenty: 1, low: 2, out: 3 }

  return (
    <>
      <h2>{t.items.title}</h2>
      <div className="filter-row">
        <input className="search" placeholder={t.items.search} readOnly />
        <button
          type="button"
          className={`secondary small-button order-button${missingOnly ? ' pressed' : ''}`}
          aria-pressed={missingOnly}
          onClick={() => setMissingOnly(!missingOnly)}
        >
          Csak hiány
        </button>
      </div>
      {groups.map(([category, list]) => (
        <section key={category} className="card">
          <h3>{CATEGORY_NAMES[category]}</h3>
          <ul className="item-list">
            {[...list]
              .sort((a, b) => (order[a.level ?? 'x'] ?? 9) - (order[b.level ?? 'x'] ?? 9))
              .map((it) => {
                const cooking = reserved.get(it.name)
                return (
                  <li key={it.name}>
                    <span className="item-row">
                      <Named
                        thing={{ name: it.name, icon: null, category: it.category }}
                        kind="item"
                      />
                      <span className="small">
                        {cooking && (
                          <span
                            className="no-restock reserved"
                            role="img"
                            aria-label={`Foglalva: ${recipeOf(data, cooking).name}`}
                          >
                            <IconArt name="chef-hat" />
                          </span>
                        )}
                        {!it.restock && (
                          <span className="no-restock" role="img" aria-label="nem pótoljuk">
                            <IconArt name="repeat-off" />
                          </span>
                        )}
                        {it.level && <LevelName level={it.level} />}
                        <span className="muted">
                          {it.level && ' · '}
                          {it.level ? '1 helyen' : 'sehol'}
                        </span>
                      </span>
                    </span>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
      <p className="small muted proto-legend">
        <IconArt name="chef-hat" /> foglalva egy betervezett főzéshez
      </p>
    </>
  )
}
