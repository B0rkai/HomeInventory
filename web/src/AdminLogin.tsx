import { type FormEvent, useState } from 'react'
import { logIn, type UserOut } from './api'
import { t } from './strings'

/** The password form of the admin pages' LAN port, where there's no Tailscale identity. */
export function AdminLogin({ onLoggedIn }: { onLoggedIn: (user: UserOut) => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    const { data, response } = await logIn({ body: { password } }).catch(() => ({
      data: undefined,
      response: undefined,
    }))
    setSending(false)
    if (data) {
      onLoggedIn(data)
      return
    }
    const status = response?.status
    setError(
      status === 401
        ? t.admin.wrongPassword
        : status === 429
          ? t.admin.tooManyTries
          : status === undefined
            ? t.errors.unreachable
            : t.errors.status(status),
    )
  }

  return (
    <form className="card nickname-form admin-login" onSubmit={submit}>
      <h2>{t.admin.logInTitle}</h2>
      <input
        type="password"
        aria-label={t.admin.password}
        placeholder={t.admin.password}
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoFocus
        required
      />
      {error && (
        <p className="small out-text" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={sending || !password}>
          {t.admin.logIn}
        </button>
      </div>
    </form>
  )
}
