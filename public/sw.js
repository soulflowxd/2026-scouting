/* global self, clients */
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(self.registration.showNotification(data.title ?? "Scout alert", {
    body: data.body ?? "A robot breakdown needs a pit follow-up.",
    tag: data.tag,
    icon: "/scouting-icon.svg",
    requireInteraction: true,
    data: { url: data.url ?? "/matches" },
  }))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.url ?? "/matches", self.location.origin)
    if (url.origin !== self.location.origin) return
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const window of windows) {
      if (new URL(window.url).origin === url.origin) {
        await window.navigate(url.href)
        await window.focus()
        return
      }
    }
    await clients.openWindow(url.href)
  })())
})
