import type { Level } from './api'
import { t } from './strings'

const LEVELS: Level[] = ['plenty', 'low', 'out']

/** Three buttons, one tap to change the level. */
export function LevelPicker({
  level,
  label,
  onChange,
}: {
  level: Level
  label: string
  onChange: (level: Level) => void
}) {
  return (
    <div className="levels" role="radiogroup" aria-label={label}>
      {LEVELS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === level}
          className={`level ${option}`}
          onClick={() => option !== level && onChange(option)}
        >
          {t.levels[option]}
        </button>
      ))}
    </div>
  )
}
