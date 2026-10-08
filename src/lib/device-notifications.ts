export async function disconnectDeviceNotifications(remove: (args: { endpoint: string }) => Promise<unknown>) {
  if (!("serviceWorker" in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration("/")
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await remove({ endpoint: subscription.endpoint })
    await subscription.unsubscribe()
  }
}
