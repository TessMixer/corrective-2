// Firebase Messaging Service Worker
// Required by Firebase Cloud Messaging for background push notifications
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBOZn013w18SkqeuwIkNrZuNoQn8wFhhq8",
  authDomain: "corrective-5bf09.firebaseapp.com",
  projectId: "corrective-5bf09",
  storageBucket: "corrective-5bf09.firebasestorage.app",
  messagingSenderId: "232500381090",
  appId: "1:232500381090:web:955fe78402180dba0d5efb",
});

const messaging = firebase.messaging();

// Handle background push messages
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon, data } = payload.notification || payload.data || {};

  self.registration.showNotification(title || "NOC Alert", {
    body: body || "",
    icon: icon || "/symphony-logo.jpg",
    badge: "/symphony-logo.jpg",
    tag: data?.incidentId || "noc-alert",
    renotify: true,
    requireInteraction: true,
    data: data || {},
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  });
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", data: event.notification.data });
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
