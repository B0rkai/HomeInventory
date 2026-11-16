import type { Shortage } from './tree'
import { t } from './strings'

/** "2 out, 1 low" as two small counters; nothing when all is plenty. */
export function ShortageBadge({ shortage }: { shortage: Shortage }) {
  return (
    <>
      {shortage.out > 0 && (
        <span className="badge out" title={t.levels.out}>
          {shortage.out}
        </span>
      )}
      {shortage.low > 0 && (
        <span className="badge low" title={t.levels.low}>
          {shortage.low}
        </span>
      )}
    </>
  )
}
