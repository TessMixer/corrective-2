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

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }) };
    }

    const payload = JSON.parse(event.body || "{}");
    const incidentNumber = String(payload.incident_number || payload.incident || "").trim();

    if (!incidentNumber) {
      return { statusCode: 400, body: JSON.stringify({ error: "INCIDENT_NUMBER_REQUIRED" }) };
    }

    const db = getDb();
    const storeRef = db.collection("appState").doc("noc-store");
    const alertsRef = storeRef.collection("alerts");

    const sameIncidentSnap = await alertsRef.where("incident", "==", incidentNumber).get();
    
    if (sameIncidentSnap.empty) {
      return { statusCode: 404, body: JSON.stringify({ error: "INCIDENT_NOT_FOUND" }) };
    }

    const now = new Date().toISOString();
    const batch = db.batch();

    sameIncidentSnap.docs.forEach((doc) => {
      const currentData = doc.data() || {};
      batch.set(doc.ref, {
        status: currentData.previousStatus || "ACTIVE",
        previousStatus: admin.firestore.FieldValue.delete(),
        cancelledAt: admin.firestore.FieldValue.delete(),
        cancelReason: admin.firestore.FieldValue.delete(),
        deletedAt: admin.firestore.FieldValue.delete(),
        updatedAt: now
      }, { merge: true });
    });

    await batch.commit();

    return {
      statusCode: 200,
      body: JSON.stringify({
        incident_number: incidentNumber,
        restored_rows: sameIncidentSnap.size,
        message: "INCIDENT_RESTORED"
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "RESTORE_INCIDENT_FAILED" }),
    };
  }
};
