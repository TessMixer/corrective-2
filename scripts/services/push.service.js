// push.service.js — FCM Web Push: permission request, token management
import { getApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
// Replace this with your actual VAPID key
const VAPID_KEY = window.NOC_VAPID_KEY || "";

async function saveTokenToFirestore(token) {
  try {
    const db = getFirestore(getApp());
    const tokenRef = doc(db, "fcmTokens", token);
    await setDoc(tokenRef, {
      token,
      userAgent: navigator.userAgent,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log("[PushService] Token saved to Firestore");
  } catch (err) {
    console.warn("[PushService] Failed to save token:", err.message);
  }
}

async function initPush() {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    console.warn("[PushService] Push not supported in this browser");
    return;
  }

  if (!VAPID_KEY) {
    console.warn("[PushService] VAPID key not configured — skipping push init");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("[PushService] Notification permission denied");
      return;
    }

    const app = getApp();
    const messaging = getMessaging(app);

    // Register SW directly (idempotent) to avoid timing issues with load event
    let swReg;
    try {
      swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
    } catch (e) {
      console.warn("[PushService] SW register failed:", e.message);
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (token) {
      console.log("[PushService] FCM token:", token);
      await saveTokenToFirestore(token);
      window._fcmToken = token;
    }

    // Handle foreground messages
    onMessage(messaging, (payload) => {
      const { title, body } = payload.notification || {};
      const data = payload.data || {};
      console.log("[PushService] Foreground message:", payload);

      // Show in-app banner instead of OS notification (foreground)
      showInAppBanner(title || "NOC Alert", body || "", data);

      // Dispatch to store if it's a new alert notification
      if (data.type === "new-alert" && window.Store) {
        window.Store.dispatch((s) => ({ ...s })); // trigger re-render
      }
    });

    // Listen for notification click messages from SW
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "NOTIFICATION_CLICK" && window.Store) {
        const incidentId = event.data?.data?.incidentId;
        if (incidentId) {
          window.Store.dispatch((s) => ({
            ...s,
            ui: { ...s.ui, currentView: "alert-monitor", highlightIncidentId: incidentId },
          }));
        }
      }
    });

  } catch (err) {
    console.warn("[PushService] Init failed:", err.message);
  }
}

function showInAppBanner(title, body, data = {}) {
  const existing = document.getElementById("pwa-push-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "pwa-push-banner";
  banner.className = "fixed top-4 right-4 z-[9999] max-w-sm w-full bg-zinc-900 text-white rounded-2xl shadow-2xl border border-orange-500/30 p-4 flex items-start gap-3 animate-slide-in";
  banner.style.cssText = "animation: slideInRight 0.3s ease-out;";
  banner.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center shrink-0 mt-0.5">
      <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
      </svg>
    </div>
    <div class="flex-1 min-w-0">
      <p class="font-bold text-sm text-orange-400">${title}</p>
      <p class="text-xs text-slate-300 mt-0.5 line-clamp-2">${body}</p>
    </div>
    <button id="pwa-banner-close" class="text-slate-400 hover:text-white transition-colors shrink-0">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
  `;

  document.body.appendChild(banner);

  banner.addEventListener("click", (e) => {
    if (e.target.closest("#pwa-banner-close")) {
      banner.remove();
      return;
    }
    banner.remove();
    if (data.incidentId && window.Store) {
      window.Store.dispatch((s) => ({
        ...s,
        ui: { ...s.ui, currentView: "alert-monitor", highlightIncidentId: data.incidentId },
      }));
    }
  });

  // Auto dismiss after 8 seconds
  setTimeout(() => banner?.remove(), 8000);
}

// Auto-init when DOM ready (handle both cases: before and after DOMContentLoaded)
function _autoInitPush() {
  initPush().catch((err) => console.warn("[PushService] Init error:", err));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _autoInitPush);
} else {
  _autoInitPush();
}

window.PushService = { initPush, showInAppBanner };
