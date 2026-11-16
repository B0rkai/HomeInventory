import { t } from './strings'

/** What the server sends for a notification (server/src/homeinventory/notify.py). */
export type PushMessage = {
  event: 'reported' | 'claimed' | 'done' | 'fetched' | 'refilled' | 'due' | 'reminder'
  kind: 'buy' | 'chore'
  name: string
  variant: string | null
  place: string | null
  level: 'lots' | 'plenty' | 'low' | 'out' | null
  actor: string | null
  tag: string
  url: string
}

/** The notification's title and body, in Hungarian. */
export function notificationText(message: PushMessage): { title: string; body: string } {
  const name = message.variant ? `${message.name} · ${message.variant}` : message.name
  const place = message.place ?? t.notify.wholeHouse
  const actor = message.actor ?? ''
  switch (message.event) {
    case 'reported':
      return message.kind === 'buy'
        ? {
            title: t.notify.reportedBuy(t.levels[message.level ?? 'low'], name),
            body: t.notify.reportedBy(place, actor),
          }
        : { title: name, body: t.notify.reportedChoreBy(place, actor) }
    case 'claimed':
      return { title: t.notify.claimed(actor, name), body: place }
    case 'done':
      return {
        title:
          message.kind === 'buy' ? t.notify.bought(actor, name) : t.notify.choreDone(actor, name),
        body: place,
      }
    case 'fetched':
      return { title: t.notify.fetched(actor, name), body: place }
    case 'refilled':
      return { title: t.notify.refilled(name), body: t.notify.refilledBy(place, actor) }
    case 'reminder':
      return { title: t.notify.reminder(actor, name), body: t.notify.reminderBody(place) }
    case 'due':
      return { title: t.notify.due(name), body: place }
  }
}
