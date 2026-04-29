const { handlePreflight, withCors } = require('./_cors');
const { requireAuth } = require('./_auth');
// netlify/functions/delete-incident.js
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();
function normalizeId(value = "") {
  return String(value || "").trim().toLowerCase();
}

function matchesIncident(item = {}, incidentId) {
  const target = normalizeId(incidentId);
  if (!target) return false;

  const candidates = [
    item.incident,
    item.incidentId,
    item.id,
    item.incident_number,
    item.incidentNo,
    item.caseId,
  ];

  return candidates.some((value) => normalizeId(value) === target);
}

async function _handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { incidentId } = JSON.parse(event.body);
    if (!incidentId) {
      return { statusCode: 400, body: JSON.stringify({ error: "incidentId is required" }) };
    }

    const storeRef = db.collection("appState").doc("noc-store");
    const alertsRef = storeRef.collection("alerts");
    const correctiveRef = storeRef.collection("corrective");
    const [alertsSnap, correctiveSnap] = await Promise.all([alertsRef.get(), correctiveRef.get()]);
    
    let deletedCount = 0;

    for (const alertDoc of alertsSnap.docs) {
      if (matchesIncident({ id: alertDoc.id, ...alertDoc.data() }, incidentId)) {
        await alertDoc.ref.delete();
        deletedCount++;
      }
    }

    for (const correctiveDoc of correctiveSnap.docs) {
      if (matchesIncident({ id: correctiveDoc.id, ...correctiveDoc.data() }, incidentId)) {
        await correctiveDoc.ref.delete();
        deletedCount++;
      }
    }

    const updated = deletedCount > 0;
    if (updated) {
      console.log(`Successfully deleted incident ${incidentId} from cloud sub-collections.`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, deleted: updated }),
    };
  } catch (error) {
    console.error("Error deleting incident:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}

// CORS-wrapped handler

exports.handler = async (event) => {
  const pre = handlePreflight(event);
  if (pre) return pre;
  const authErr = requireAuth(event);
  if (authErr) return withCors(authErr);
  const result = await _handler(event);
  return withCors(result);
};
