const admin = require("firebase-admin");

function createAdminAdapter(projectId, clientEmail, rawPrivateKey) {
  const privateKey = rawPrivateKey.includes("\n")
    ? rawPrivateKey.replace(/\\n/g, "\n")
    : rawPrivateKey;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
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

function createClientAdapter(projectId, apiKey, appId) {
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
function getDbAdapter() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  const apiKey = process.env.FIREBASE_API_KEY;
  const appId = process.env.FIREBASE_APP_ID;

  const canUseAdmin = Boolean(projectId && clientEmail && rawPrivateKey);
  const canUseClient = Boolean(projectId && apiKey && appId);

  let adminInitError;

  if (canUseAdmin) {
    try {
      return createAdminAdapter(projectId, clientEmail, rawPrivateKey);
    } catch (err) {
      adminInitError = err;
    }
  }

  if (canUseClient) {
    try {
      return createClientAdapter(projectId, apiKey, appId);
    } catch (err) {
      const detail = err?.message || "CLIENT_ADAPTER_INIT_FAILED";
      const adminDetail = adminInitError?.message || null;
      throw new Error(`FIREBASE_ADAPTER_INIT_FAILED: ${detail}${adminDetail ? ` | admin: ${adminDetail}` : ""}`);
    }
  }

  if (adminInitError) {
    throw new Error(`FIREBASE_ADMIN_INIT_FAILED: ${adminInitError.message || "UNKNOWN"}`);
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

function normalizePayload(rawPayload = {}, context = {}) {
  const payload = unwrapPayloadItem(rawPayload);

  const incident =
    pick(payload, "incident", "incidentId", "incidentNumber", "Incident Number", "Inf#", "id") ||
    context.incident;

  if (!incident) {
    throw new Error("INCIDENT_REQUIRED");
  }

  const tickets = Array.isArray(payload.tickets)
    ? payload.tickets.map((item) => normalizeTicket(unwrapPayloadItem(item))).filter(Boolean)
    : [normalizeTicket(payload)].filter(Boolean);

  return {
    incident,
    node: pick(payload, "node", "Node", "Node Name") || context.node || "-",
    alarm: pick(payload, "alarm", "Alarm") || context.alarm || "-",
    detail: pick(payload, "detail", "Detail") || context.detail || "",
    nocBy: pick(payload, "nocBy", "NOC Alert") || context.nocBy || "System",
    severity: pick(payload, "severity") || context.severity || "Medium",
    status: pick(payload, "status") || context.status || "OPEN",
    workType: pick(payload, "workType", "Work Type") || context.workType || "-",
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
function normalizeBatchWithContext(items) {
  const context = {};
  const normalizedItems = [];
  const itemErrors = [];

  items.forEach((item, index) => {
    try {
      const normalized = normalizePayload(item, context);
      normalizedItems.push(normalized);

      context.incident = normalized.incident || context.incident;
      context.node = normalized.node || context.node;
      context.alarm = normalized.alarm || context.alarm;
      context.detail = normalized.detail || context.detail;
      context.nocBy = normalized.nocBy || context.nocBy;
      context.severity = normalized.severity || context.severity;
      context.status = normalized.status || context.status;
      context.workType = normalized.workType || context.workType;
    } catch (err) {
      itemErrors.push({
        index,
        error: err.message || "NORMALIZE_FAILED",
        item: unwrapPayloadItem(item),
      });
    }
  });

  return { normalizedItems, itemErrors };
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
    const { normalizedItems, itemErrors } = normalizeBatchWithContext(items);

    if (!normalizedItems.length && itemErrors.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "NO_VALID_ITEMS",
          itemErrors,
        }),
      };
    }

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
        itemErrors,
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

    if (message.startsWith("FIREBASE_ADMIN_INIT_FAILED") || message.startsWith("FIREBASE_ADAPTER_INIT_FAILED")) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "FIREBASE_INIT_FAILED",
          detail: message,
          hint: "Check FIREBASE_PRIVATE_KEY formatting or remove invalid admin credentials to use API_KEY/APP_ID fallback.",
        }),
      };
    }

    return {
      statusCode: isClientError ? 400 : 500,
      body: JSON.stringify({ error: message }),

    };
  }
};
