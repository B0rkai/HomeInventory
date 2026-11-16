import { type FormEvent, useState } from 'react'
import { updateCurrentUser, type UserOut } from './api'
import { t } from './strings'

const MAX_LENGTH = 40 // the server's limit

type Props = {
  user: UserOut
  onSaved: (user: UserOut) => void
  // Shown only when editing an existing nickname; the first-time prompt can't be dismissed.
  onCancel?: () => void
}

export function NicknameForm({ user, onSaved, onCancel }: Props) {
  // First time: suggest the first word of the Tailscale name ("Ákos Borkai" -> "Ákos").
  const [value, setValue] = useState(user.nickname ?? user.name.split(/\s+/)[0])
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFailed(false)
    const { data } = await updateCurrentUser({ body: { nickname: value } }).catch(() => ({
      data: undefined,
    }))
    setSaving(false)
    if (data) onSaved(data)
    else setFailed(true)
  }

  return (
    <form className="card nickname-form" onSubmit={save}>
      <label htmlFor="nickname">
        <strong>{onCancel ? t.nickname.label : t.nickname.prompt}</strong>
      </label>
      <p className="muted">{t.nickname.hint}</p>
      <input
        id="nickname"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={MAX_LENGTH}
        autoComplete="nickname"
        enterKeyHint="done"
        required
      />
      {failed && <p role="alert">{t.nickname.saveFailed}</p>}
      <div className="actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            {t.nickname.cancel}
          </button>
        )}
        <button type="submit" disabled={saving || !value.trim()}>
          {saving ? t.nickname.saving : t.nickname.save}
        </button>
      </div>
    </form>
  )
}
