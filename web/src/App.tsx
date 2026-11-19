import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, logOut, type UserOut } from './api'
import { AdminPages } from './AdminPages'
import { AdminLogin } from './AdminLogin'
import { Home } from './Home'
import { useHouse } from './house'
import { HouseProvider } from './HouseProvider'
import { IconArt } from './IconArt'
import { CookingPage, PlanPage } from './CookingPages'
import { ItemPage } from './ItemPage'
import { ItemsPage } from './ItemsPage'
import { LogPage } from './LogPage'
import { MenuPage } from './MenuPage'
import { NicknameForm } from './NicknameForm'
import { PlacePage } from './PlacePage'
import { refreshPush } from './push'
import { PushSettings } from './PushSettings'
import { RecipeEditPage, RecipePage } from './RecipePage'
import { href, useRoute, type Route } from './route'
import { t } from './strings'
import { ago } from './time'
import { TodoPage } from './TodoPage'
import { UndoBar } from './UndoBar'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; user: UserOut }
  | { kind: 'error'; message: string }
  // The admin pages' LAN port, not logged in.
  | { kind: 'login' }

// The server's 401 detail on the admin port.
const LOG_IN = 'Log in as Admin'

// Who used the app on this device last, so it opens offline too (with the saved house).
const USER_KEY = 'me'

function rememberUser(user: UserOut): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Only a convenience.
  }
}

function lastUser(): UserOut | undefined {
  try {
    const text = localStorage.getItem(USER_KEY)
    return text ? (JSON.parse(text) as UserOut) : undefined
  } catch {
    return undefined
  }
}

function errorMessage(status: number | undefined): string {
  if (status === undefined) return t.errors.unreachable
  if (status === 401) return t.errors.noIdentity
  // A success status without data: the answer wasn't JSON (e.g. an HTML page).
  if (status < 400) return t.errors.unexpected
  return t.errors.status(status)
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [editingNickname, setEditingNickname] = useState(false)
  const [notice, setNotice] = useState<string>()
  const showError = useCallback((message: string) => setNotice(message), [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(undefined), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    getCurrentUser().then(
      ({ data, error, response }) => {
        if (data) {
          rememberUser(data)
          setState({ kind: 'ready', user: data })
          return
        }
        if (response?.status === 401 && (error as { detail?: unknown })?.detail === LOG_IN) {
          setState({ kind: 'login' })
          return
        }
        // Out of reach (no answer at all): carry on as who was here last, offline.
        const known = response ? undefined : lastUser()
        setState(
          known
            ? { kind: 'ready', user: known }
            : { kind: 'error', message: errorMessage(response?.status) },
        )
      },
      () => {
        const known = lastUser()
        setState(
          known
            ? { kind: 'ready', user: known }
            : { kind: 'error', message: errorMessage(undefined) },
        )
      },
    )
  }, [])

  // Keeps the server's record of this device current (say, after a nickname change).
  const userId = state.kind === 'ready' ? state.user.id : undefined
  useEffect(() => {
    if (userId !== undefined) refreshPush().catch(() => {})
  }, [userId])

  function saved(user: UserOut) {
    rememberUser(user)
    setState({ kind: 'ready', user })
    setEditingNickname(false)
  }

  const user = state.kind === 'ready' ? state.user : undefined
  const route = useRoute()
  // Admin only ever sees the admin pages; people open them at #/admin.
  const adminView = state.kind === 'login' || user?.admin || route.page === 'admin'

  async function leave() {
    await logOut().catch(() => undefined)
    try {
      localStorage.removeItem(USER_KEY)
    } catch {
      // Only a convenience.
    }
    setState({ kind: 'login' })
  }

  return (
    <div className={adminView ? 'app admin' : 'app'}>
      <header className="app-header">
        <h1>
          <a href={adminView ? href.admin() : href.home}>
            {t.appName}
            {adminView && <span className="muted"> · {t.admin.title}</span>}
          </a>
        </h1>
        {adminView && user?.admin && (
          <button type="button" className="user" onClick={() => void leave()}>
            {t.admin.logOut}
          </button>
        )}
        {adminView && user && !user.admin && (
          <a className="user" href={href.home}>
            {t.admin.phoneView}
          </a>
        )}
        {!adminView && user?.nickname && (
          <button
            type="button"
            className="user"
            aria-label={t.nickname.editHint}
            onClick={() => setEditingNickname(true)}
          >
            {user.display_name}
          </button>
        )}
      </header>
      <main>
        {state.kind === 'loading' && <p className="muted">{t.loading}</p>}
        {state.kind === 'error' && (
          <div className="card" role="alert">
            <p>{state.message}</p>
          </div>
        )}
        {user && !user.nickname && <NicknameForm user={user} onSaved={saved} />}
        {user?.nickname && editingNickname && (
          <>
            <NicknameForm user={user} onSaved={saved} onCancel={() => setEditingNickname(false)} />
            <PushSettings />
          </>
        )}
        {state.kind === 'login' && (
          <AdminLogin
            onLoggedIn={(admin) => {
              rememberUser(admin)
              setState({ kind: 'ready', user: admin })
            }}
          />
        )}
        {user?.nickname && !editingNickname && adminView && (
          <HouseProvider me={user} onError={showError}>
            <AdminPages view={route.page === 'admin' ? route.view : 'items'} />
            <UndoBar />
          </HouseProvider>
        )}
        {user?.nickname && !editingNickname && !adminView && (
          <HouseProvider me={user} onError={showError}>
            <Pages />
            <UndoBar />
            <NavBar />
          </HouseProvider>
        )}
      </main>
      {notice && (
        <div className="notice" role="alert" onClick={() => setNotice(undefined)}>
          {notice}
        </div>
      )}
    </div>
  )
}

function Pages() {
  const { house, loadError, offlineSince, reload } = useHouse()

  if (!house) {
    return loadError ? (
      <div className="card" role="alert">
        <p>{loadError}</p>
        <div className="actions">
          <button type="button" onClick={reload}>
            {t.retry}
          </button>
        </div>
      </div>
    ) : (
      <p className="muted">{t.loading}</p>
    )
  }
  return (
    <>
      {offlineSince && (
        <div className="offline-bar" role="status">
          {t.offline(ago(offlineSince))}
        </div>
      )}
      <Page />
    </>
  )
}

function Page() {
  const route = useRoute()
  if (route.page === 'place') return <PlacePage key={route.id} id={route.id} />
  if (route.page === 'items') return <ItemsPage />
  if (route.page === 'item') return <ItemPage key={route.id} id={route.id} />
  if (route.page === 'menu') return <MenuPage view={route.view} />
  if (route.page === 'plan')
    return <PlanPage key={route.recipeId ?? 'pick'} recipeId={route.recipeId} />
  if (route.page === 'cooking')
    return <CookingPage key={`${route.id}-${route.left}`} id={route.id} left={route.left} />
  if (route.page === 'recipe') return <RecipePage key={route.id} id={route.id} />
  if (route.page === 'recipeEdit') return <RecipeEditPage key={route.id ?? 'new'} id={route.id} />
  if (route.page === 'todo') return <TodoPage view={route.view} />
  if (route.page === 'log') return <LogPage />
  return <Home />
}

const TABS: { page: Route['page']; href: string; icon: string; label: string }[] = [
  { page: 'home', href: href.home, icon: 'home', label: t.nav.places },
  { page: 'todo', href: href.todo(), icon: 'list-check', label: t.nav.todo },
  { page: 'menu', href: href.menu, icon: 'chef-hat', label: t.nav.menu },
  { page: 'items', href: href.items, icon: 'clipboard-list', label: t.nav.items },
  { page: 'log', href: href.log, icon: 'history', label: t.nav.log },
]

function NavBar() {
  const route = useRoute()
  const { house } = useHouse()
  // Nobody's on these yet.
  const open = house?.requests.filter((r) => r.status === 'open').length ?? 0
  // A place's page belongs to the Places tab, an item's to the Items tab.
  const current =
    route.page === 'place'
      ? 'home'
      : route.page === 'item'
        ? 'items'
        : ['recipe', 'recipeEdit', 'plan', 'cooking'].includes(route.page)
          ? 'menu'
          : route.page

  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <a key={tab.page} href={tab.href} aria-current={tab.page === current ? 'page' : undefined}>
          <span className="tab-icon" aria-hidden="true">
            <IconArt name={tab.icon} />
            {tab.page === 'todo' && open > 0 && <span className="tab-count">{open}</span>}
          </span>
          {tab.label}
        </a>
      ))}
    </nav>
  )
}
