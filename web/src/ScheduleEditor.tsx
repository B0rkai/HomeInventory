import { type FormEvent, useState } from 'react'
import type { ChoreOut } from './api'
import { useHouse } from './house'
import { t } from './strings'

type Mode = 'none' | 'weekly' | 'days'

const DEFAULT_DAYS = 7

/** How a chore repeats: not at all, on chosen weekdays, or every so many days. */
export function ScheduleEditor({ chore }: { chore: ChoreOut }) {
  const { actions } = useHouse()
  const mode: Mode = chore.repeat_weekdays.length ? 'weekly' : chore.repeat_days ? 'days' : 'none'
  const [days, setDays] = useState(String(chore.repeat_days ?? DEFAULT_DAYS))

  function choose(next: Mode) {
    if (next === mode) return
    if (next === 'none') {
      void actions.updateChore(chore.id, { repeat_days: null, repeat_weekdays: null })
    } else if (next === 'weekly') {
      // Today's weekday, Monday = 0.
      void actions.updateChore(chore.id, { repeat_weekdays: [(new Date().getDay() + 6) % 7] })
    } else {
      setDays(String(DEFAULT_DAYS))
      void actions.updateChore(chore.id, { repeat_days: DEFAULT_DAYS })
    }
  }

  function toggle(day: number) {
    const chosen = chore.repeat_weekdays.includes(day)
      ? chore.repeat_weekdays.filter((d) => d !== day)
      : [...chore.repeat_weekdays, day]
    if (chosen.length) void actions.updateChore(chore.id, { repeat_weekdays: chosen })
  }

  function saveDays(event: FormEvent) {
    event.preventDefault()
    const value = Number(days)
    if (value >= 1 && value <= 365 && value !== chore.repeat_days) {
      void actions.updateChore(chore.id, { repeat_days: value })
    }
  }

  const modes: [Mode, string][] = [
    ['none', t.place.repeatNone],
    ['weekly', t.place.repeatWeekly],
    ['days', t.place.repeatDays],
  ]

  return (
    <div className="schedule">
      <div className="segmented" role="radiogroup" aria-label={`${chore.name}: ${t.place.repeat}`}>
        {modes.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => choose(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'weekly' && (
        <div className="weekdays">
          {t.time.weekdaysShort.map((label, day) => {
            const on = chore.repeat_weekdays.includes(day)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={t.time.weekdays[day]}
                // The last chosen day stays: no days would mean not repeating.
                disabled={on && chore.repeat_weekdays.length === 1}
                onClick={() => toggle(day)}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
      {mode === 'days' && (
        <form className="every-days" onSubmit={saveDays}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            aria-label={t.place.repeatDays}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            onBlur={saveDays}
          />
          <span>{t.place.everyDays}</span>
        </form>
      )}
      {mode !== 'none' && <p className="small muted">{t.place.repeatHint}</p>}
    </div>
  )
}
