import { getPushKey, subscribe, unsubscribe } from './api'

// This device's notifications: the browser's push subscription, registered with the server.

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on'

const OPTIONS = { userVisibleOnly: true }

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

async function pushManager(): Promise<PushManager> {
  return (await navigator.serviceWorker.ready).pushManager
}

async function currentSubscription(): Promise<PushSubscription | null> {
  return (await pushManager()).getSubscription()
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const manager = await pushManager()
  // The push permission, which is what counts (and what Chrome asks for on subscribing).
  if ((await manager.permissionState(OPTIONS)) === 'denied') return 'blocked'
  return (await manager.getSubscription()) ? 'on' : 'off'
}

async function register(subscription: PushSubscription): Promise<boolean> {
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) return false
  const { response } = await subscribe({
    body: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
  })
  return Boolean(response?.ok)
}

function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/** Subscribes, which asks for permission first (needs a tap); resolves to the new state. */
export async function enablePush(): Promise<PushState> {
  const { data } = await getPushKey()
  if (!data) throw new Error('no push key')
  const manager = await pushManager()
  let subscription = await manager.getSubscription()
  if (!subscription) {
    try {
      subscription = await manager.subscribe({
        ...OPTIONS,
        applicationServerKey: decodeKey(data.public_key),
      })
    } catch (error) {
      // Permission refused: say so instead of failing.
      if ((await manager.permissionState(OPTIONS)) !== 'granted') return pushState()
      throw error
    }
  }
  if (!(await register(subscription))) throw new Error('subscribe failed')
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription()
  if (subscription) {
    await unsubscribe({ query: { endpoint: subscription.endpoint } })
    await subscription.unsubscribe()
  }
  return pushState()
}

/** Tells the server again about this device's subscription, e.g. after the user changed. */
export async function refreshPush(): Promise<void> {
  if (!pushSupported()) return
  const subscription = await currentSubscription()
  if (subscription) await register(subscription)
}
