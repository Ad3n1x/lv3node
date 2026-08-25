self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: "Uni-Track", body: "Time to check your trackers!" };

  const options = {
    body: data.body,
    icon: '/logo.svg',
    badge: '/logo.svg'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});