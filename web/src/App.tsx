import { useEffect, useState } from 'react'
import { getCurrentUser, type UserOut } from './api'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; user: UserOut }
  | { kind: 'error'; message: string }

function errorMessage(status: number | undefined): string {
  if (status === undefined) return "Can't reach the server."
  if (status === 401) return 'Open the app through its Tailscale address.'
  // A success status without data: the answer wasn't JSON (e.g. an HTML page).
  if (status < 400) return 'Unexpected answer from the server.'
  return `The server answered ${status}.`
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>HomeInventory</h1>
        {state.kind === 'ready' && <span className="user">{state.user.name}</span>}
      </header>
      <main>
        {state.kind === 'loading' && <p className="muted">Loading…</p>}
        {state.kind === 'error' && (
          <div className="card" role="alert">
            <p>{state.message}</p>
          </div>
        )}
        {state.kind === 'ready' && (
          <div className="card">
            <p>Hi, {state.user.name}!</p>
            <p className="muted">Places and stock levels come next.</p>
          </div>
        )}
      </main>
    </div>
  )
}
