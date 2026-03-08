const admin = require("firebase-admin");

function getDbAdapter() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && rawPrivateKey) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: rawPrivateKey.replace(/\\n/g, "\n"),
        }),
      });
    }

    const db = admin.firestore();
    const alertsRef = db.collection("appState").doc("noc-store").collection("alerts");

    return {
      mode: "admin",
      getDocRef(id) {
        return alertsRef.doc(id);
      },
      async readDoc(docRef) {
        const snap = await docRef.get();
        return {
          exists: snap.exists,
          data: snap.exists ? snap.data() || {} : {},
        };
      },
      async writeDoc(docRef, payload) {
        await docRef.set(payload, { merge: true });
      },
    };
  }

  const apiKey = process.env.FIREBASE_API_KEY;
  const appId = process.env.FIREBASE_APP_ID;

  if (projectId && apiKey && appId) {
    const { initializeApp, getApps } = require("firebase/app");
    const { getFirestore, collection, doc, getDoc, setDoc } = require("firebase/firestore");

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          projectId,
          apiKey,
          appId,
        });

    const db = getFirestore(app);
    const alertsRef = collection(db, "appState", "noc-store", "alerts");

    return {
      mode: "client",
      getDocRef(id) {
        return doc(alertsRef, id);
      },
      async readDoc(docRef) {
        const snap = await getDoc(docRef);
        return {
          exists: snap.exists(),
          data: snap.exists() ? snap.data() || {} : {},
        };
      },
      async writeDoc(docRef, payload) {
        await setDoc(docRef, payload, { merge: true });
      },
    };
  }

  throw new Error("FIREBASE_CONFIG_MISSING");
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
function unwrapPayloadItem(payload = {}) {
  if (payload && typeof payload === "object" && payload.json && typeof payload.json === "object") {
    return payload.json;
  }

  return payload;
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

function normalizePayload(rawPayload = {}) {
  const payload = unwrapPayloadItem(rawPayload);

  const incident = pick(payload, "incident", "incidentId", "incidentNumber", "Incident Number", "Inf#", "id");

  if (!incident) {
    throw new Error("INCIDENT_REQUIRED");
  }

  const tickets = Array.isArray(payload.tickets)
    ? payload.tickets.map((item) => normalizeTicket(unwrapPayloadItem(item))).filter(Boolean)
    : [normalizeTicket(payload)].filter(Boolean);

  return {
    incident,
    node: pick(payload, "node", "Node", "Node Name") || "-",
    alarm: pick(payload, "alarm", "Alarm") || "-",
    detail: pick(payload, "detail", "Detail") || "",
    nocBy: pick(payload, "nocBy", "NOC Alert") || "System",
    severity: pick(payload, "severity") || "Medium",
    status: pick(payload, "status") || "OPEN",
    workType: pick(payload, "workType", "Work Type") || "-",
    tickets,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function parseBody(event) {
  const raw = event.body;

  if (!raw) return {};

  if (typeof raw !== "string") return raw;

  try {
    return JSON.parse(raw);
  } catch (_) {
    const parsed = Object.fromEntries(new URLSearchParams(raw));
    if (Object.keys(parsed).length) return parsed;
    throw new Error("INVALID_BODY");
  }
}

async function upsertIncident(adapter, normalized) {

  const incidentKey = normalizeIdentifier(normalized.incident);
  const nodeKey = normalizeIdentifier(normalized.node || "-");
  const docId = `${incidentKey}__${nodeKey}`;
  const docRef = adapter.getDocRef(docId);

  const docState = await adapter.readDoc(docRef);
  const current = docState.data;
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
  await adapter.writeDoc(docRef, {
    ...current,
    ...normalized,
    tickets: [...existingTickets, ...incomingTickets],
    updatedAt: new Date().toISOString(),
    createdAt: current.createdAt || normalized.createdAt,
  });

  return {
    id: docId,
    status: docState.exists ? (incomingTickets.length ? "updated" : "skipped") : "created",
    incident: normalized.incident,
    node: normalized.node,
  };
}

function normalizeBatchPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [payload];
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
    const items = normalizeBatchPayload(payload);
    const normalizedItems = items.map((item) => normalizePayload(item));
    const adapter = getDbAdapter();

    const results = [];
    for (const normalized of normalizedItems) {
      const result = await upsertIncident(adapter, normalized);
      results.push(result);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        mode: adapter.mode,
        count: results.length,
        results,
      }),
    };
  } catch (err) {
    const message = err.message || "CREATE_INCIDENT_FAILED";
    const isClientError = ["INCIDENT_REQUIRED", "INVALID_BODY"].includes(message);
        if (message === "FIREBASE_CONFIG_MISSING") {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "FIREBASE_CONFIG_MISSING",
          requiredAnyOf: [
            ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"],
            ["FIREBASE_PROJECT_ID", "FIREBASE_API_KEY", "FIREBASE_APP_ID"],
          ],
        }),
      };
    }

    return {
      statusCode: isClientError ? 400 : 500,
      body: JSON.stringify({ error: message }),

    };
  }
};
