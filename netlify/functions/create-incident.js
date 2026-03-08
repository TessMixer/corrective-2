const admin = require("firebase-admin");

function ensureAdmin() {
  if (admin.apps.length) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("FIREBASE_CONFIG_MISSING");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function pick(payload, ...keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
}

function extractIncident(payload = {}) {
  const direct = pick(payload, "incident", "incidentId", "id", "incidentNumber", "jobId", "job");
  if (direct) {
    return String(direct).trim();
  }

  const subject = String(pick(payload, "subject", "title", "emailSubject") || "");
  const match = subject.match(/\(?(I\d{4}-\d{6})\)?/i);
  if (match?.[1]) {
    return match[1].toUpperCase();
  }

  return undefined;
}

function normalizeText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function buildTicket(raw = {}) {
  const ticket = {
    ticket: normalizeText(pick(raw, "ticket", "symphonyTicket", "Symphony Ticket", "symphony_ticket")),
    cid: normalizeText(pick(raw, "cid", "symphonyCid", "Symphony CID", "symphony_cid")),
    port: normalizeText(pick(raw, "port", "nodePort", "Node Port")),
    downTime: normalizeText(pick(raw, "downtime", "downTime", "Down Time")),
    actualDowntime: normalizeText(pick(raw, "actual", "actualDowntime", "Actual Downtime")),
    clearTime: normalizeText(pick(raw, "cleartime", "clearTime", "Clear Time")),
    originate: normalizeText(pick(raw, "originate", "Originate")),
    terminate: normalizeText(pick(raw, "terminate", "Terminate")),
    pending: normalizeText(pick(raw, "pending", "Pending")),
    total: normalizeText(pick(raw, "total", "Total")),
  };

  return Object.values(ticket).some(Boolean) ? ticket : null;
}

function normalizeTickets(payload = {}) {
  const candidateLists = [payload.tickets, payload.items, payload.rows];

  const fromArray = candidateLists.find((value) => Array.isArray(value));
  const list = fromArray || [payload];

  const parsed = list
    .map((item) => buildTicket(item))
    .filter(Boolean);

  const seen = new Set();
  return parsed.filter((ticket) => {
    const key = ticket.ticket || `${ticket.cid}:${ticket.port}:${ticket.downTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePayload(payload = {}) {
  const incident = extractIncident(payload);
  if (!incident) {
    throw new Error("INCIDENT_REQUIRED");
  }

  return {
    incident,
    incidentId: incident,
    node: normalizeText(pick(payload, "node", "Node"), "-"),
    alarm: normalizeText(pick(payload, "alarm", "Alarm"), "-"),
    detail: normalizeText(pick(payload, "detail", "Detail")),
    createdAt: new Date().toISOString(),
    nocBy: normalizeText(pick(payload, "nocBy", "nocAlert", "NOC Alert", "noc"), "System"),
    severity: normalizeText(pick(payload, "severity"), "Medium"),
    status: normalizeText(pick(payload, "status"), "OPEN"),
    workType: normalizeText(pick(payload, "workType"), "-"),
    tickets: normalizeTickets(payload),
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

    ensureAdmin();
    const db = admin.firestore();

    const docRef = await db.collection("appState").doc("noc-store").collection("alerts").add(normalized);

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
