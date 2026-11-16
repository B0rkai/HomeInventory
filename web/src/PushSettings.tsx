import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, type PushState } from './push'
import { t } from './strings'

const DISMISSED = 'push-prompt-dismissed'

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

/**
 * Notifications on this device. As a prompt (on the to-do page) it only shows while
 * they're off and not waved away; in the settings it's always there, to turn them off too.
 */
export function PushSettings({ prompt = false }: { prompt?: boolean }) {
  const [state, setState] = useState<PushState>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hidden, setHidden] = useState(() => prompt && dismissed())

  useEffect(() => {
    pushState().then(setState, () => setState('unsupported'))
  }, [])

  async function change(action: () => Promise<PushState>) {
    setBusy(true)
    setFailed(false)
    try {
      setState(await action())
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  function later() {
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      // Private mode: it just comes back next time.
    }
    setHidden(true)
  }

  if (!state || hidden) return null
  if (prompt && state !== 'off') return null

  return (
    <section className="card push-settings">
      <h3>{t.push.title}</h3>
      <p className="muted">
        {state === 'on'
          ? t.push.on
          : state === 'blocked'
            ? t.push.blocked
            : state === 'unsupported'
              ? t.push.unsupported
              : t.push.hint}
      </p>
      {failed && <p role="alert">{t.push.failed}</p>}
      {(state === 'off' || state === 'on') && (
        <div className="actions">
          {prompt && (
            <button type="button" className="secondary" onClick={later}>
              {t.push.later}
            </button>
          )}
          {state === 'off' ? (
            <button type="button" disabled={busy} onClick={() => change(enablePush)}>
              {t.push.enable}
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => change(disablePush)}
            >
              {t.push.disable}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
