const { initializeApp, getApps } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  projectId: process.env.FIREBASE_PROJECT_ID,
  appId: process.env.FIREBASE_APP_ID,
};

function getDb() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error("FIREBASE_CONFIG_MISSING");
  }

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

function pick(payload, ...keys) {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      return payload[key];
    }
  }

  return undefined;
}

function normalizePayload(payload = {}) {
  const incident = pick(payload, "incident", "incidentId", "id");

  if (!incident) {
    throw new Error("INCIDENT_REQUIRED");
  }

  const tickets = Array.isArray(payload.tickets)
    ? payload.tickets
    : [
        {
          ticket: pick(payload, "ticket", "symphonyTicket"),
          cid: payload.cid,
          port: payload.port,
          downTime: pick(payload, "downtime", "downTime"),
          actualDowntime: pick(payload, "actual", "actualDowntime"),
          clearTime: pick(payload, "cleartime", "clearTime"),
          originate: payload.originate,
          terminate: payload.terminate,
          pending: payload.pending,
        },
      ].filter((ticket) => Object.values(ticket).some(Boolean));

  return {
    incident,
    node: payload.node || "-",
    alarm: payload.alarm || "-",
    detail: payload.detail || "",
    createdAt: new Date().toISOString(),
    nocBy: payload.nocBy || "System",
    severity: payload.severity || "Medium",
    status: payload.status || "OPEN",
    workType: payload.workType || "-",
    tickets,
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }),
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const normalized = normalizePayload(data);
    const db = getDb();

    const docRef = await addDoc(collection(db, "appState", "noc-store", "alerts"), normalized);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "created",
        id: docRef.id,
        incident: normalized.incident,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || "CREATE_INCIDENT_FAILED",
      }),
    };
  }
};