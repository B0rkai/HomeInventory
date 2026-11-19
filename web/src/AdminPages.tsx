import { AdminItems } from './AdminItems'
import { AdminLog } from './AdminLog'
import { AdminPeople } from './AdminPeople'
import { AdminPlaces } from './AdminPlaces'
import { AdminRecipes } from './AdminRecipes'
import { AdminTodo } from './AdminTodo'
import { useHouse } from './house'
import { href, type AdminView } from './route'
import { t } from './strings'

const TABS: [AdminView, string][] = [
  ['items', t.admin.items],
  ['places', t.admin.places],
  ['todo', t.admin.todo],
  ['recipes', t.menu.recipes],
  ['log', t.admin.log],
  ['people', t.admin.people],
]

/** The desktop admin pages: a tab row, then the page. */
export function AdminPages({ view }: { view: AdminView }) {
  const { house, loadError } = useHouse()
  return (
    <>
      <nav className="admin-tabs">
        {TABS.map(([key, label]) => (
          <a key={key} href={href.admin(key)} aria-current={key === view ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {!house && <p className="muted">{loadError ?? t.loading}</p>}
      {view === 'items' && <AdminItems />}
      {view === 'places' && <AdminPlaces />}
      {view === 'todo' && <AdminTodo />}
      {view === 'recipes' && <AdminRecipes />}
      {view === 'log' && <AdminLog />}
      {view === 'people' && <AdminPeople />}
    </>
  )
}
