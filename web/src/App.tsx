import { useEffect, useState } from 'react'
import { getCurrentUser, type UserOut } from './api'
import { NicknameForm } from './NicknameForm'
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
        <h1>{t.appName}</h1>
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
          <div className="card">
            <p>{t.greeting(user.display_name)}</p>
            <p className="muted">{t.comingSoon}</p>
          </div>
        )}
      </main>
    </div>
  )
}
