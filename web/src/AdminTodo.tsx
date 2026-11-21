import { type FormEvent, useEffect, useState } from 'react'
import { listUsers, type ChoreOut, type RequestOut, type UserOut } from './api'
import { TextCell } from './AdminItems'
import { cookingName } from './cookings'
import { dayFor, dayFrom, today } from './days'
import { needsPlace, useHouse } from './house'
import { KeepForm } from './KeepForm'
import { Named } from './Named'
import { OneOffForm } from './OneOffForm'
import { ScheduleEditor } from './ScheduleEditor'
import { t } from './strings'
import { ago, upcoming } from './time'
import { placePath, treeOrder } from './tree'

const ACTIVE = ['open', 'claimed']

/** What's to do now, each given to someone in one go; and every chore with its schedule. */
export function AdminTodo() {
  const { house } = useHouse()
  const [people, setPeople] = useState<UserOut[]>([])
  useEffect(() => {
    listUsers().then(
      ({ data }) => data && setPeople(data),
      () => {},
    )
  }, [])
  if (!house) return null
  const active = house.requests
    .filter((request) => ACTIVE.includes(request.status))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  return (
    <>
      <h3 className="admin-section">{t.admin.active}</h3>
      {active.length === 0 ? (
        <p className="muted">{t.admin.noActive}</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t.admin.what}</th>
                <th>{t.admin.placeColumn}</th>
                <th>{t.admin.since}</th>
                <th>{t.admin.state}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((request) => (
                <RequestRow key={request.id} request={request} people={people} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OneOffForm />
      <h3 className="admin-section">{t.admin.chores}</h3>
      <ChoreTable people={people} />
    </>
  )
}

function RequestRow({ request, people }: { request: RequestOut; people: UserOut[] }) {
  const { house, actions } = useHouse()
  const [keeping, setKeeping] = useState(false)
  // Where an item with no place yet goes, picked before marking it bought.
  const [place, setPlace] = useState('')
  if (!house) return null
  const askPlace = needsPlace(request)
  const item = house.items.find((i) => i.id === request.item_id)
  const chore = house.chores.find((c) => c.id === request.chore_id)
  const thing = item ?? chore ?? { name: request.name ?? '', icon: null }
  // The cooking it's due for.
  const cooking = house.cookings.find((c) => c.id === request.cooking_id)
  return (
    <>
      <tr>
        <td>
          <Named thing={thing} kind={chore ? 'chore' : 'item'} />
        </td>
        <td className="small">
          {request.location_id === null
            ? chore
              ? t.home.wholeHouse
              : askPlace
                ? t.todo.noPlaceYet
                : t.notify.shoppingList
            : placePath(house.locations, request.location_id)}
          {cooking && (
            <div className="muted">
              {t.menu.forCooking(cookingName(house, cooking), dayFor(cooking.day))}
            </div>
          )}
          {request.buy_from && request.buy_from > today() && (
            <div className="muted">{t.todo.buyFrom(dayFrom(request.buy_from))}</div>
          )}
        </td>
        <td className="small muted">{ago(request.created_at)}</td>
        <td>
          <Assign request={request} people={people} />
        </td>
        <td className="edit-cell">
          <button
            type="button"
            className="secondary small-button"
            onClick={() => actions.act('cancel', [request.id])}
          >
            {t.admin.cancelRequest}
          </button>
          {/* Written on the list by hand: kept track of from now on. */}
          {request.name !== null && (
            <button
              type="button"
              className="secondary small-button"
              aria-expanded={keeping}
              onClick={() => setKeeping(!keeping)}
            >
              {t.todo.keep}
            </button>
          )}
          {askPlace && (
            <select
              aria-label={t.todo.wherePut}
              value={place}
              onChange={(event) => setPlace(event.target.value)}
            >
              <option value="" disabled>
                {t.todo.wherePut}
              </option>
              {treeOrder(house.locations).map((location) => (
                <option key={location.id} value={location.id}>
                  {placePath(house.locations, location.id)}
                </option>
              ))}
            </select>
          )}
          <DoneFor
            people={people}
            claimedBy={request.claimed_by_id}
            verb={request.kind === 'buy' ? t.admin.boughtBy : t.admin.doneBy}
            disabled={askPlace && !place}
            onDone={(person) =>
              actions.act('done', [request.id], {
                by: person.id,
                place: askPlace ? Number(place) : undefined,
              })
            }
          />
        </td>
      </tr>
      {keeping && (
        <tr className="edit-row">
          <td colSpan={5}>
            <KeepForm request={request} onClose={() => setKeeping(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

/** Done, by whom: Admin hands work out, so it's marked done for the person who did it. */
function DoneFor({
  people,
  claimedBy,
  verb,
  disabled,
  onDone,
}: {
  people: UserOut[]
  claimedBy: number | null
  verb: (name: string) => string
  disabled?: boolean
  onDone: (person: UserOut) => void
}) {
  // Whoever has it is the likely one, so first.
  const ordered = [...people].sort(
    (a, b) => Number(b.id === claimedBy) - Number(a.id === claimedBy),
  )
  return (
    <select
      className="done-for"
      aria-label={t.admin.doneFor}
      value=""
      disabled={disabled}
      onChange={(event) => {
        const person = people.find((p) => p.id === Number(event.target.value))
        if (person) onDone(person)
      }}
    >
      <option value="" disabled>
        {t.admin.doneFor}
      </option>
      {ordered.map((person) => (
        <option key={person.id} value={person.id}>
          {verb(person.display_name)}
        </option>
      ))}
    </select>
  )
}

/** Who has it, and a picker to give it to someone (claimed for them; they're told). */
function Assign({ request, people }: { request: RequestOut; people: UserOut[] }) {
  const { actions } = useHouse()
  return (
    <select
      aria-label={t.admin.assign}
      value={request.claimed_by_id ?? ''}
      onChange={(event) => {
        const userId = Number(event.target.value)
        if (userId) void actions.assignRequest(request.id, userId)
        else actions.act('unclaim', [request.id])
      }}
    >
      <option value="">{t.admin.free}</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {request.claimed_by_id === person.id
            ? t.admin.claimedBy(person.display_name)
            : t.admin.assignTo(person.display_name)}
        </option>
      ))}
    </select>
  )
}

function ChoreTable({ people }: { people: UserOut[] }) {
  const { house } = useHouse()
  const [editing, setEditing] = useState<number>()
  if (!house) return null
  const chores = [...house.chores].sort(
    (a, b) =>
      (a.location_id === null ? '' : placePath(house.locations, a.location_id)).localeCompare(
        b.location_id === null ? '' : placePath(house.locations, b.location_id),
        'hu',
      ) || a.name.localeCompare(b.name, 'hu'),
  )
  if (chores.length === 0) {
    return (
      <>
        <p className="muted">{t.admin.noChores}</p>
        <AddChore onAdded={setEditing} />
      </>
    )
  }
  return (
    <>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t.admin.name}</th>
              <th>{t.admin.placeColumn}</th>
              <th>{t.admin.schedule}</th>
              <th>{t.admin.nextDue}</th>
              <th>{t.admin.lastDone}</th>
              <th>{t.admin.state}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {chores.map((chore) => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                people={people}
                editing={editing === chore.id}
                onEdit={() => setEditing(editing === chore.id ? undefined : chore.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <AddChore onAdded={setEditing} />
    </>
  )
}

/** A new lasting chore, of a place or the whole house; its schedule opens next. */
function AddChore({ onAdded }: { onAdded: (id: number) => void }) {
  const { house, actions } = useHouse()
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  if (!house) return null
  const { locations } = house

  async function add(event: FormEvent) {
    event.preventDefault()
    const chore = await actions.addChore(place ? Number(place) : null, name.trim())
    if (chore) {
      setName('')
      onAdded(chore.id)
    }
  }

  return (
    <form className="admin-filters admin-add" onSubmit={add}>
      <input
        className="search"
        aria-label={t.admin.addChore}
        placeholder={t.admin.addChoreName}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        required
      />
      <select
        aria-label={t.admin.placeColumn}
        value={place}
        onChange={(event) => setPlace(event.target.value)}
      >
        <option value="">{t.home.wholeHouse}</option>
        {treeOrder(locations).map((location) => (
          <option key={location.id} value={location.id}>
            {placePath(locations, location.id)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!name.trim()}>
        + {t.admin.addChore}
      </button>
    </form>
  )
}

function schedule(chore: ChoreOut): string {
  if (chore.one_off) return t.admin.oneOff
  if (chore.repeat_weekdays.length) {
    return [...chore.repeat_weekdays]
      .sort((a, b) => a - b)
      .map((day) => t.time.weekdays[day])
      .join(', ')
  }
  return chore.repeat_days ? t.admin.everyDays(chore.repeat_days) : t.admin.noRepeat
}

function ChoreRow({
  chore,
  people,
  editing,
  onEdit,
}: {
  chore: ChoreOut
  people: UserOut[]
  editing: boolean
  onEdit: () => void
}) {
  const { house, actions } = useHouse()
  if (!house) return null
  const request = house.requests.find((r) => r.chore_id === chore.id && ACTIVE.includes(r.status))
  return (
    <>
      <tr>
        <td>
          <div className="name-cell">
            <Named thing={{ ...chore, name: '' }} kind="chore" />
            <TextCell
              key={chore.name}
              value={chore.name}
              label={t.admin.name}
              required
              onSave={(name) => void actions.updateChore(chore.id, { name })}
            />
          </div>
        </td>
        <td className="small">
          {chore.location_id === null
            ? t.home.wholeHouse
            : placePath(house.locations, chore.location_id)}
        </td>
        <td className="small">
          {chore.one_off ? (
            <span className="muted">{schedule(chore)}</span>
          ) : (
            <button type="button" className="link-button" onClick={onEdit}>
              {schedule(chore)}
            </button>
          )}
        </td>
        <td className="small muted">{chore.next_due_at ? upcoming(chore.next_due_at) : ''}</td>
        <td className="small muted">
          {chore.last_done_at
            ? `${ago(chore.last_done_at)}${chore.last_done_by_name ? ` · ${chore.last_done_by_name}` : ''}`
            : t.admin.never}
        </td>
        <td>
          {request ? (
            <Assign request={request} people={people} />
          ) : (
            <select
              aria-label={t.admin.assign}
              value=""
              onChange={async (event) => {
                // Not due yet: make it due now, then give it.
                const userId = Number(event.target.value)
                const reported = await actions.reportChoreNow(chore.id)
                if (reported && userId) void actions.assignRequest(reported.id, userId)
              }}
            >
              <option value="">—</option>
              <option value="0">{t.admin.report}</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {t.admin.report}: {t.admin.assignTo(person.display_name)}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className="edit-cell">
          <DoneFor
            people={people}
            claimedBy={request?.claimed_by_id ?? null}
            verb={t.admin.doneBy}
            onDone={(person) => actions.completeChore(chore.id, person)}
          />
          <button
            type="button"
            className="danger small-button"
            onClick={() => {
              if (window.confirm(t.admin.confirmDeleteChore(chore.name)))
                void actions.deleteChore(chore.id)
            }}
          >
            {t.admin.deleteChore}
          </button>
        </td>
      </tr>
      {editing && (
        <tr className="edit-row">
          <td colSpan={7}>
            <ScheduleEditor chore={chore} />
          </td>
        </tr>
      )}
    </>
  )
}
