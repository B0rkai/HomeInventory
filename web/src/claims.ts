import type { RequestOut, UserOut } from './api'
import { t } from './strings'

/** Who's on a request: "Te intézed", "Anna intézi"; nothing while it's open. */
export function claimText(request: RequestOut | undefined, me: UserOut): string | undefined {
  if (request?.claimed_by_id == null) return undefined
  return request.claimed_by_id === me.id
    ? t.todo.mine
    : t.todo.theirs(request.claimed_by_name ?? '')
}
