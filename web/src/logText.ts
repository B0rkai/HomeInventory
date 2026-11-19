import type { ActivityOut } from './api'
import { t } from './strings'

/** What someone did, as a log line says it after their name ("megvette"); empty for a
 * level, which shows the level instead. */
export function verb(entry: ActivityOut): string {
  switch (entry.action) {
    case 'done':
      return entry.kind === 'buy' ? t.log.bought : t.log.choreDone
    case 'level':
      return ''
    case 'assigned':
      return t.log.assigned(entry.assignee_name ?? '?')
    default:
      return t.log[entry.action]
  }
}
