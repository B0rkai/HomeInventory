import type { Level } from './api'
import { t } from './strings'

const LEVELS: Level[] = ['lots', 'plenty', 'low', 'out']

const BARS: Record<Level, number> = { lots: 3, plenty: 2, low: 1, out: 0 }

/** Three bars, filled by level, like a phone's signal meter. */
export function Gauge({ level }: { level: Level }) {
  return (
    <span className={`gauge ${level}`} aria-hidden="true">
      {[1, 2, 3].map((bar) => (
        <span key={bar} className={bar <= BARS[level] ? 'on' : undefined} />
      ))}
    </span>
  )
}

/** Four buttons, one tap to change the level; the name is for screen readers. */
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
          aria-label={t.levels[option]}
          title={t.levels[option]}
          className={`level ${option}`}
          onClick={() => option !== level && onChange(option)}
        >
          <Gauge level={option} />
        </button>
      ))}
    </div>
  )
}

/** "Kevés" in the level's colour, for the line under an item's name. */
export function LevelName({ level }: { level: Level }) {
  return <span className={`level-name ${level}`}>{t.levels[level]}</span>
}
