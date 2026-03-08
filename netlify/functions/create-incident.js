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

function sanitizeKey(key = "") {
  return key.toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}
function normalizeIdentifier(value = "") {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function buildLookup(payload) {
  const lookup = new Map();

  Object.entries(payload || {}).forEach(([key, value]) => {
    lookup.set(sanitizeKey(key), value);
  });

  return lookup;
}

function pick(payload, ...keys) {
  const lookup = buildLookup(payload);

  for (const key of keys) {
    const value = lookup.get(sanitizeKey(key));

    if (value !== undefined && value !== null && value !== "") {
      return typeof value === "string" ? value.trim() : value;
    }
  }

  return undefined;
}

function normalizeTicket(payload = {}) {
  const ticket = {
    ticket: pick(payload, "ticket", "symphonyTicket", "Symphony Ticket"),
    cid: pick(payload, "cid", "symphonyCid", "Symphony CID"),
    port: pick(payload, "port"),
    downTime: pick(payload, "downtime", "downTime", "Down Time"),
    actualDowntime: pick(payload, "actual", "actualDowntime", "Actual Downtime"),
    clearTime: pick(payload, "cleartime", "clearTime", "Clear Time"),
    total: pick(payload, "total"),
    originate: pick(payload, "originate"),
    terminate: pick(payload, "terminate"),
    pending: pick(payload, "pending"),
  };

  return Object.values(ticket).some(Boolean) ? ticket : null;
}

function normalizePayload(payload = {}) {
  const incident = pick(
    payload,
    "incident",
    "incidentId",
    "incidentNumber",
    "Incident Number",
    "Inf#",
    "id"
  );

  if (!incident) {
    throw new Error("INCIDENT_REQUIRED");
  }

  const tickets = Array.isArray(payload.tickets)
    ? payload.tickets.map((item) => normalizeTicket(item)).filter(Boolean)
    : [normalizeTicket(payload)].filter(Boolean);

  return {
    incident,
    node: pick(payload, "node") || "-",
    alarm: pick(payload, "alarm") || "-",
    detail: pick(payload, "detail") || "",
    nocBy: pick(payload, "nocBy", "NOC Alert") || "System",
    severity: pick(payload, "severity") || "Medium",
    status: pick(payload, "status") || "OPEN",
    workType: pick(payload, "workType") || "-",
    tickets,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function parseBody(event) {
  const raw = event.body;

  if (!raw) return {};

  if (typeof raw !== "string") {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    const parsed = Object.fromEntries(new URLSearchParams(raw));
    if (Object.keys(parsed).length) {
      return parsed;
    }
    throw new Error("INVALID_BODY");
  }
}

async function upsertIncident(db, normalized) {
  const alertsRef = db.collection("appState").doc("noc-store").collection("alerts");

  // Group by incident + node to prevent duplicated rows in Alert Monitor.
  // If node is same, tickets are accumulated in the same incident record.
  const incidentKey = normalizeIdentifier(normalized.incident);
  const nodeKey = normalizeIdentifier(normalized.node || "-");
  const docId = `${incidentKey}__${nodeKey}`;
  const docRef = alertsRef.doc(docId);
  const docSnap = await docRef.get();
  const current = docSnap.exists ? docSnap.data() || {} : {};
  const existingTickets = Array.isArray(current.tickets) ? current.tickets : [];

  const existingTicketKeys = new Set(
    existingTickets
      .map((item) => item?.ticket)
      .filter(Boolean)
      .map((value) => value.toString().trim())
  );

  const incomingTickets = normalized.tickets.filter((item) => {
    const key = item?.ticket ? item.ticket.toString().trim() : "";
    return !key || !existingTicketKeys.has(key);
  });

  await docRef.set(
    {
      ...current,
      ...normalized,
      tickets: [...existingTickets, ...incomingTickets],
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return { id: docId, status: docSnap.exists ? (incomingTickets.length ? "updated" : "skipped") : "created" };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }),
    };
  }

  try {
    const payload = parseBody(event);
    const normalized = normalizePayload(payload);
    const db = getDb();
    const result = await upsertIncident(db, normalized);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: result.status,
        id: result.id,
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
