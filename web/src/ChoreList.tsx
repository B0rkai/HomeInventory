import type { ReactNode } from 'react'
import type { ChoreOut, RequestOut } from './api'
import { AddForm } from './AddForm'
import { claimText } from './claims'
import { useHouse } from './house'
import { Named } from './Named'
import { ScheduleEditor } from './ScheduleEditor'
import { t } from './strings'
import { ago, upcoming } from './time'

/**
 * The chores of a place, or of the whole house (no location): report them, mark them done,
 * and in edit mode add, delete or schedule them.
 */
export function ChoreList({
  locationId,
  editing,
}: {
  locationId: number | null
  editing: boolean
}) {
  const { house, actions } = useHouse()
  if (!house) return null
  // One-off to-dos live on the to-do list only.
  const chores = house.chores.filter((chore) => chore.location_id === locationId && !chore.one_off)
  const wholeHouse = locationId === null
  // The house's list only shows up once it has something, or to add the first one.
  if (wholeHouse && !chores.length && !editing) return null

  return (
    <section className="card">
      <h3>{wholeHouse ? t.home.choresTitle : t.place.choresTitle}</h3>
      {chores.length === 0 && !editing && <p className="muted">{t.place.noChores}</p>}
      {chores.length === 0 && editing && wholeHouse && (
        <p className="muted small">{t.home.choresHint}</p>
      )}
      <ul className="missing-rows">
        {chores.map((chore) => (
          <ChoreRow
            key={chore.id}
            chore={chore}
            request={house.requests.find((request) => request.chore_id === chore.id)}
            editing={editing}
          />
        ))}
      </ul>
      {editing && (
        <AddForm
          label={t.place.addChore}
          placeholder={wholeHouse ? t.home.addChorePlaceholder : t.place.addChorePlaceholder}
          onSubmit={async (name) => Boolean(await actions.addChore(locationId, name))}
        />
      )}
    </section>
  )
}

/** A chore: report it, or say it's done (reported or not); and when it last was. */
function ChoreRow({
  chore,
  request,
  editing,
}: {
  chore: ChoreOut
  request: RequestOut | undefined
  editing: boolean
}) {
  const { me, actions } = useHouse()
  if (editing) {
    return (
      <li className="chore-edit">
        <div className="chore">
          <Named thing={chore} kind="chore" />
          <button
            type="button"
            className="icon"
            aria-label={t.place.removeChore(chore.name)}
            onClick={() => {
              if (window.confirm(t.place.confirmRemoveChore(chore.name))) {
                void actions.deleteChore(chore.id)
              }
            }}
          >
            ×
          </button>
        </div>
        <ScheduleEditor chore={chore} />
      </li>
    )
  }
  const done = (
    <button
      type="button"
      className="secondary small-button"
      onClick={() => actions.completeChore(chore.id)}
    >
      ✓ {t.todo.done}
    </button>
  )
  let action: ReactNode
  if (request) {
    action = done
  } else {
    action = (
      <>
        {done}
        <button
          type="button"
          className="small-button"
          onClick={() => actions.reportChore(chore.id)}
        >
          {t.place.report}
        </button>
      </>
    )
  }
  // A line each: who's on it, or when it was last done and when it's due next.
  const lines = (
    request
      ? [claimText(request, me) ?? t.place.reported]
      : [
          chore.last_done_at &&
            t.place.lastDone(chore.last_done_by_name ?? '', ago(chore.last_done_at)),
          chore.next_due_at && t.place.nextDue(upcoming(chore.next_due_at)),
        ]
  ).filter((line) => line)
  return (
    <li className="chore">
      <Named thing={chore} kind="chore" />
      <span className="chore-state">{action}</span>
      {lines.length > 0 && (
        <span className="chore-lines">
          {lines.map((line) => (
            <span key={line} className={`small ${request ? 'claim' : 'muted'}`}>
              {line}
            </span>
          ))}
        </span>
      )}
    </li>
  )
}
