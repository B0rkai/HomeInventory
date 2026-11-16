import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, type UserOut } from './api'
import { Home } from './Home'
import { useHouse } from './house'
import { HouseProvider } from './HouseProvider'
import { IconArt } from './IconArt'
import { ItemsPage } from './ItemsPage'
import { MissingPage } from './MissingPage'
import { NicknameForm } from './NicknameForm'
import { PlacePage } from './PlacePage'
import { href, useRoute, type Route } from './route'
import { t } from './strings'
import { isShort } from './tree'

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
          <NicknameForm user={user} onSaved={saved} onCancel={() => setEditingNickname(false)} />
        )}
        {user?.nickname && !editingNickname && (
          <HouseProvider onError={showError}>
            <Pages />
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
  if (route.page === 'missing') return <MissingPage view={route.view} />
  return <Home />
}

const TABS: { page: Route['page']; href: string; icon: string; label: string }[] = [
  { page: 'home', href: href.home, icon: 'home', label: t.nav.places },
  { page: 'missing', href: href.missing(), icon: 'shopping-cart', label: t.nav.missing },
  { page: 'items', href: href.items, icon: 'clipboard-list', label: t.nav.items },
]

function NavBar() {
  const route = useRoute()
  const { house } = useHouse()
  const missing = house?.stock.filter(isShort).length ?? 0
  // A place page belongs to the Places tab.
  const current = route.page === 'place' ? 'home' : route.page

  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <a key={tab.page} href={tab.href} aria-current={tab.page === current ? 'page' : undefined}>
          <span className="tab-icon" aria-hidden="true">
            <IconArt name={tab.icon} />
            {tab.page === 'missing' && missing > 0 && <span className="tab-count">{missing}</span>}
          </span>
          {tab.label}
        </a>
      ))}
    </nav>
  )
}
