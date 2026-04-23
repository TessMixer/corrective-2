// send-push.js — Send FCM Web Push to all registered tokens
const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) return admin.apps[0];
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { title, body, incidentId, type = "new-alert" } = payload;
  if (!title) {
    return { statusCode: 400, body: "Missing title" };
  }

  try {
    const app = getAdminApp();
    const db = admin.firestore(app);

    // Get all FCM tokens from Firestore
    const snap = await db.collection("fcmTokens").get();
    if (snap.empty) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "no tokens" }) };
    }

    const tokens = snap.docs.map((d) => d.data().token).filter(Boolean);
    if (!tokens.length) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "no valid tokens" }) };
    }

    const message = {
      notification: { title, body: body || "" },
      data: {
        type,
        incidentId: incidentId || "",
        url: incidentId ? `/?view=alert-monitor&highlight=${incidentId}` : "/",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
      webpush: {
        notification: {
          title,
          body: body || "",
          icon: "/symphony-logo.jpg",
          badge: "/symphony-logo.jpg",
          requireInteraction: true,
          tag: incidentId || "noc-alert",
          renotify: true,
          actions: [
            { action: "open", title: "Open" },
            { action: "dismiss", title: "Dismiss" },
          ],
        },
        fcmOptions: { link: incidentId ? `/?highlight=${incidentId}` : "/" },
      },
      tokens,
    };

    const result = await admin.messaging(app).sendEachForMulticast(message);
    console.log(`[send-push] Sent: ${result.successCount}/${tokens.length}`);

    // Clean up invalid tokens
    const invalidTokens = [];
    result.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code || "";
        if (["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(code)) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length) {
      await Promise.all(
        invalidTokens.map((token) => db.collection("fcmTokens").doc(token).delete())
      );
      console.log(`[send-push] Cleaned ${invalidTokens.length} invalid tokens`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        success: result.successCount,
        failure: result.failureCount,
        total: tokens.length,
      }),
    };
  } catch (err) {
    console.error("[send-push] Error:", err.message);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
