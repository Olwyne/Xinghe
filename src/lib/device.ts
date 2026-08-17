const DEVICE_ID_KEY = 'xinghe-device-id'

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function isDesktop(): boolean {
  return window.innerWidth >= 768
}
