import { useCallback, useEffect, useState } from 'react'
import {
  deleteSubscription,
  listSubscriptions,
  listUsers,
  updateUser,
  type PushSubscriptionOut,
  type UserOut,
} from './api'
import { TextCell } from './AdminItems'
import { useHouse } from './house'
import { t } from './strings'
import { ago } from './time'

/** "Android 14 · Chrome": enough of a User-Agent to tell two phones apart. */
function deviceName(agent: string | null): string {
  if (!agent) return t.admin.unknownDevice
  const system =
    /Android [\d.]+/.exec(agent)?.[0] ??
    (/iPhone|iPad/.exec(agent) ? 'iOS' : undefined) ??
    (/Windows/.exec(agent) ? 'Windows' : undefined) ??
    (/Mac OS X/.exec(agent) ? 'macOS' : undefined) ??
    (/Linux/.exec(agent) ? 'Linux' : undefined)
  const browser =
    (/Edg\//.exec(agent) && 'Edge') ||
    (/SamsungBrowser/.exec(agent) && 'Samsung Internet') ||
    (/Firefox\//.exec(agent) && 'Firefox') ||
    (/Chrome\//.exec(agent) && 'Chrome') ||
    (/Safari\//.exec(agent) && 'Safari') ||
    undefined
  // A phone's model, where Chrome still says it ("SM-S918B").
  const model = /Android [\d.]+; ([^;)]+)\)/.exec(agent)?.[1]
  const parts = [system, model && model !== 'K' ? model : undefined, browser].filter(Boolean)
  return parts.length ? parts.join(' · ') : t.admin.unknownDevice
}

/** The people (nicknames) and the devices that get their notifications. */
export function AdminPeople() {
  const { onError } = useAdminErrors()
  const [people, setPeople] = useState<UserOut[]>()
  const [devices, setDevices] = useState<PushSubscriptionOut[]>()
  const load = useCallback(() => {
    listUsers().then(({ data }) => data && setPeople(data), onError)
    listSubscriptions().then(({ data }) => data && setDevices(data), onError)
  }, [onError])
  useEffect(load, [load])

  return (
    <>
      <h3 className="admin-section">{t.admin.peopleTitle}</h3>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.admin.nickname}</th>
              <th>{t.admin.name}</th>
              <th>{t.admin.login}</th>
            </tr>
          </thead>
          <tbody>
            {people?.map((person) => (
              <tr key={person.id}>
                <td>
                  <TextCell
                    key={person.nickname ?? ''}
                    value={person.nickname ?? ''}
                    label={t.admin.nickname}
                    required
                    onSave={(nickname) =>
                      void updateUser({ path: { user_id: person.id }, body: { nickname } }).then(
                        load,
                        onError,
                      )
                    }
                  />
                </td>
                <td>{person.name}</td>
                <td className="small muted">{person.login}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="admin-section">{t.admin.devices}</h3>
      {devices?.length === 0 ? (
        <p className="muted">{t.admin.noDevices}</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t.admin.owner}</th>
                <th>{t.admin.device}</th>
                <th>{t.admin.added}</th>
                <th>{t.admin.seen}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices?.map((device) => (
                <tr key={device.id}>
                  <td>{device.user_name}</td>
                  <td title={device.user_agent ?? undefined}>{deviceName(device.user_agent)}</td>
                  <td className="small muted">{ago(device.created_at)}</td>
                  <td className="small muted">{device.seen_at ? ago(device.seen_at) : '—'}</td>
                  <td className="edit-cell">
                    <button
                      type="button"
                      className="danger small-button"
                      onClick={() => {
                        if (!window.confirm(t.admin.confirmDeleteDevice)) return
                        void deleteSubscription({ path: { subscription_id: device.id } }).then(
                          load,
                          onError,
                        )
                      }}
                    >
                      {t.admin.deleteDevice}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function useAdminErrors() {
  const { actions } = useHouse()
  const onError = useCallback(() => actions.notify(t.errors.unreachable), [actions])
  return { onError }
}
