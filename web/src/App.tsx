import { useCallback, useEffect, useState } from 'react'
import { getCurrentUser, type UserOut } from './api'
import { Home } from './Home'
import { useHouse } from './house'
import { HouseProvider } from './HouseProvider'
import { ItemsPage } from './ItemsPage'
import { NicknameForm } from './NicknameForm'
import { PlacePage } from './PlacePage'
import { href, useRoute } from './route'
import { t } from './strings'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; user: UserOut }
  | { kind: 'error'; message: string }

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
  return <Home />
}
