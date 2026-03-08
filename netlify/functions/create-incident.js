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
    async findIncidentByNodeContext(node, alarm, detail) {
      if (!node || node === "-") return null;
      const snap = await alertsRef.where("node", "==", node).limit(50).get();
      if (snap.empty) return null;

      const alarmText = (alarm || "").toString().trim();
      const detailText = (detail || "").toString().trim();
      const contextual = candidates.find((item) => {
        const sameAlarm = alarmText && String(item.alarm || "").trim() === alarmText;
        const sameDetail = detailText && String(item.detail || "").trim() === detailText;
        return sameAlarm || sameDetail;
      });

      if (!candidates.length) return null;

        const candidates = snap.docs
        .map((doc) => doc.data() || {})
        .filter((item) => item.incident)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      return (contextual || candidates[0])?.incident || null;
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
  const { getFirestore, collection, doc, getDoc, setDoc, query, where, limit, getDocs } = require("firebase/firestore");

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
    async findIncidentByNodeContext(node, alarm, detail) {
      if (!node || node === "-") return null;
      const q = query(alertsRef, where("node", "==", node), limit(50));
      const snap = await getDocs(q);
      if (snap.empty) return null;

      const latest = snap.docs
        .map((doc) => doc.data() || {})
        .filter((item) => item.incident)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

      if (!candidates.length) return null;

      const alarmText = (alarm || "").toString().trim();
      const detailText = (detail || "").toString().trim();
      const contextual = candidates.find((item) => {
        const sameAlarm = alarmText && String(item.alarm || "").trim() === alarmText;
        const sameDetail = detailText && String(item.detail || "").trim() === detailText;
        return sameAlarm || sameDetail;
      });

      return (contextual || candidates[0])?.incident || null;
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
function removeUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => removeUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, item]) => {
      const cleaned = removeUndefinedDeep(item);
      if (cleaned !== undefined) {
        acc[key] = cleaned;
      }
      return acc;
    }, {});
  }

  return value === undefined ? undefined : value;
}

function normalizeTicket(payload = {}, fallback = {}) {
  const ticket = {
    ticket: pick(payload, "ticket", "symphonyTicket", "Symphony Ticket", "SymphonyTicket") || pick(fallback, "ticket", "symphonyTicket", "Symphony Ticket", "SymphonyTicket"),
    cid: pick(payload, "cid", "symphonyCid", "Symphony CID", "SymphonyCID") || pick(fallback, "cid", "symphonyCid", "Symphony CID", "SymphonyCID"),
    port: pick(payload, "port") || pick(fallback, "port"),
    downTime: pick(payload, "downtime", "downTime", "Down Time") || pick(fallback, "downtime", "downTime", "Down Time"),
    actualDowntime: pick(payload, "actual", "actualDowntime", "Actual Downtime") || pick(fallback, "actual", "actualDowntime", "Actual Downtime"),
    clearTime: pick(payload, "cleartime", "clearTime", "Clear Time") || pick(fallback, "cleartime", "clearTime", "Clear Time"),
    total: pick(payload, "total", "Total") || pick(fallback, "total", "Total"),
    originate: pick(payload, "originate", "Originate", "origin", "originSite", "from", "origination", "originateSite") || pick(fallback, "originate", "Originate", "origin", "originSite", "from", "origination", "originateSite"),
    terminate: pick(payload, "terminate", "Terminate", "destination", "destinate", "to", "terminateSite", "destinationSite") || pick(fallback, "terminate", "Terminate", "destination", "destinate", "to", "terminateSite", "destinationSite"),
    pending: pick(payload, "pending", "Pending") || pick(fallback, "pending", "Pending"),
  };

  const cleanedTicket = removeUndefinedDeep(ticket);
  return Object.values(cleanedTicket).some(Boolean) ? cleanedTicket : null;
}

function normalizePayload(rawPayload = {}, context = {}) {
  const payload = unwrapPayloadItem(rawPayload);

  const incident =
    pick(payload, "incident", "incidentId", "incidentNumber", "Incident Number", "Inf#", "id") ||
    context.incident;

  const resolvedIncident = incident || null;

  const tickets = Array.isArray(payload.tickets)
    ? payload.tickets.map((item) => normalizeTicket(unwrapPayloadItem(item), payload)).filter(Boolean)
    : [normalizeTicket(payload, payload)].filter(Boolean);

  return {
    incident: resolvedIncident,
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
async function ensureIncident(adapter, normalized) {
  if (normalized.incident) {
    return normalized;
  }

  const fallbackIncident = await adapter.findIncidentByNodeContext?.(
    normalized.node,
    normalized.alarm,
    normalized.detail
  );

  if (!fallbackIncident) {
    throw new Error("INCIDENT_REQUIRED");
  }

  return {
    ...normalized,
    incident: fallbackIncident,
  };
}

async function upsertIncident(adapter, normalized) {

  const incidentKey = normalizeIdentifier(normalized.incident);
  const nodeKey = normalizeIdentifier(normalized.node || "-");
  const docId = `${incidentKey}__${nodeKey}`;
  const docRef = adapter.getDocRef(docId);

  const docState = await adapter.readDoc(docRef);
  const current = docState.data;
  const existingTickets = Array.isArray(current.tickets) ? current.tickets : [];

  const mergedTickets = mergeTicketLists(existingTickets, normalized.tickets);
  const ticketsAdded = mergedTickets.length - existingTickets.length;
  const nextPayload = removeUndefinedDeep({
    ...current,
    ...normalized,
     tickets: mergedTickets,
    updatedAt: new Date().toISOString(),
    createdAt: current.createdAt || normalized.createdAt,
  });
  await adapter.writeDoc(docRef, nextPayload);

  return {
    id: docId,
    status: docState.exists ? (ticketsAdded > 0 ? "updated" : "merged") : "created",
    incident: normalized.incident,
    node: normalized.node,
  };
}

function isEmptyLike(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return normalized === "" || normalized === "-" || normalized.toLowerCase() === "n/a";
}


function mergeTicketLists(existingTickets = [], incomingTickets = []) {
  const byKey = new Map();

  existingTickets.forEach((ticket, index) => {
    const key = ticket?.ticket ? ticket.ticket.toString().trim() : `__index_${index}`;
    byKey.set(key, { ...(ticket || {}) });
  });

  incomingTickets.forEach((ticket, index) => {
    const key = ticket?.ticket ? ticket.ticket.toString().trim() : `__incoming_${index}_${Date.now()}`;

    if (!byKey.has(key)) {
      byKey.set(key, { ...(ticket || {}) });
      return;
    }

    const existing = byKey.get(key) || {};
    const merged = { ...existing };

    Object.entries(ticket || {}).forEach(([field, value]) => {
      const currentValue = existing[field];
      const hasCurrent = !isEmptyLike(currentValue);
      const hasIncoming = !isEmptyLike(value);

      if (!hasCurrent && hasIncoming) {
        merged[field] = value;
      }
    });

    byKey.set(key, merged);
  });

  return Array.from(byKey.values());
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

      if (normalized.incident) {
        context.incident = normalized.incident;
      }
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
      const resolved = await ensureIncident(adapter, normalized);
      const result = await upsertIncident(adapter, resolved);
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
