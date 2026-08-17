let wakeLockSentinel: WakeLockSentinel | null = null

export async function acquireWakeLock(): Promise<boolean> {
  if (!('wakeLock' in navigator)) return false
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen')
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null
    })
    return true
  } catch {
    return false
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (wakeLockSentinel) {
    await wakeLockSentinel.release()
    wakeLockSentinel = null
  }
}

export async function reacquireWakeLockIfNeeded(): Promise<void> {
  if (wakeLockSentinel === null) return
  await acquireWakeLock()
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function sendNotification(title: string, options?: NotificationOptions): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  new Notification(title, {
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    ...options,
  })
}

export function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

export function playSessionEndSound(): void {
  try {
    const ctx = new AudioContext()
    const g = ctx.createGain()
    g.connect(ctx.destination)
    g.gain.setValueAtTime(0.3, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8)

    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc1.connect(g)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.3)

    const g2 = ctx.createGain()
    g2.connect(ctx.destination)
    g2.gain.setValueAtTime(0.3, ctx.currentTime + 0.3)
    g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.1)

    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.3) // A5
    osc2.connect(g2)
    osc2.start(ctx.currentTime + 0.3)
    osc2.stop(ctx.currentTime + 0.8)

    osc2.onended = () => ctx.close()
  } catch {
    // Web Audio not available
  }
}
