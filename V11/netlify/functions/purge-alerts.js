const admin = require("firebase-admin");

function getDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error("FIREBASE_CONFIG_MISSING");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
      }),
    });
  }

  return admin.firestore();
}

function normalizeIdentifier(value = "") {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const db = getDb();
    const alertsRef = db.collection("appState").doc("noc-store").collection("alerts");

    if (body.purgeAll === true) {
      const all = await alertsRef.get();
      const batch = db.batch();
      all.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      return { statusCode: 200, body: JSON.stringify({ status: "purged_all", deleted: all.size }) };
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "ITEMS_REQUIRED" }) };
    }

    let deleted = 0;
    for (const item of items) {
      const incident = (item.incident || "").toString().trim();
      const node = (item.node || "-").toString().trim();
      if (!incident) continue;

      const docId = `${normalizeIdentifier(incident)}__${normalizeIdentifier(node)}`;
      const docRef = alertsRef.doc(docId);
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.delete();
        deleted += 1;
        continue;
      }

      // legacy fallback: delete any document that matches incident+node
      const legacySnap = await alertsRef.where("incident", "==", incident).where("node", "==", node).get();
      for (const legacyDoc of legacySnap.docs) {
        await legacyDoc.ref.delete();
        deleted += 1;
      }
    }

    return { statusCode: 200, body: JSON.stringify({ status: "purged_selected", deleted }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "PURGE_ALERTS_FAILED" }) };
  }
};