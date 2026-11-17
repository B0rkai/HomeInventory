import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, type UserOut } from './api'
import { Home } from './Home'
import { useHouse } from './house'
import { HouseProvider } from './HouseProvider'
import { IconArt } from './IconArt'
import { ItemPage } from './ItemPage'
import { ItemsPage } from './ItemsPage'
import { LogPage } from './LogPage'
import { MissingPage } from './MissingPage'
import { NicknameForm } from './NicknameForm'
import { PlacePage } from './PlacePage'
import { refreshPush } from './push'
import { PushSettings } from './PushSettings'
import { href, useRoute, type Route } from './route'
import { t } from './strings'
import { TodoPage } from './TodoPage'
import { UndoBar } from './UndoBar'

type State =
  { kind: 'loading' } | { kind: 'ready'; user: UserOut } | { kind: 'error'; message: string }

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
      ({ data, response }) =>
        setState(
          data
            ? { kind: 'ready', user: data }
            : { kind: 'error', message: errorMessage(response?.status) },
        ),
      () => setState({ kind: 'error', message: errorMessage(undefined) }),
    )
  }, [])

  // Keeps the server's record of this device current (say, after a nickname change).
  const userId = state.kind === 'ready' ? state.user.id : undefined
  useEffect(() => {
    if (userId !== undefined) refreshPush().catch(() => {})
  }, [userId])

  function saved(user: UserOut) {
    setState({ kind: 'ready', user })
    setEditingNickname(false)
  }

  const user = state.kind === 'ready' ? state.user : undefined

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <a href={href.home}>{t.appName}</a>
        </h1>
        {user?.nickname && (
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
        {user?.nickname && !editingNickname && (
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
  const route = useRoute()
  const { house, loadError, reload } = useHouse()

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
  if (route.page === 'place') return <PlacePage key={route.id} id={route.id} />
  if (route.page === 'items') return <ItemsPage />
  if (route.page === 'item') return <ItemPage key={route.id} id={route.id} />
  if (route.page === 'missing') return <MissingPage view={route.view} />
  if (route.page === 'todo') return <TodoPage view={route.view} />
  if (route.page === 'log') return <LogPage />
  return <Home />
}

const TABS: { page: Route['page']; href: string; icon: string; label: string }[] = [
  { page: 'home', href: href.home, icon: 'home', label: t.nav.places },
  { page: 'todo', href: href.todo(), icon: 'list-check', label: t.nav.todo },
  { page: 'missing', href: href.missing(), icon: 'shopping-cart', label: t.nav.missing },
  { page: 'items', href: href.items, icon: 'clipboard-list', label: t.nav.items },
  { page: 'log', href: href.log, icon: 'history', label: t.nav.log },
]

function NavBar() {
  const route = useRoute()
  const { house } = useHouse()
  // Nobody's on these yet.
  const open = house?.requests.filter((r) => r.status === 'open').length ?? 0
  // A place's page belongs to the Places tab, an item's to the Items tab.
  const current = route.page === 'place' ? 'home' : route.page === 'item' ? 'items' : route.page

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
