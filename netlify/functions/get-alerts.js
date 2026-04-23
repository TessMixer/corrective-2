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
    if (value !== undefined) {
      if (value === null || (typeof value === "string" && value.trim() === "")) {
        return null; // Explicitly empty
      }
      return typeof value === "string" ? value.trim() : value;
    }
  }
  return undefined; // Not found in payload
}

function pickContains(payload, patterns = []) {
  const entries = Object.entries(payload || {});
  const normalizedPatterns = patterns.map((p) => sanitizeKey(p)).filter(Boolean);

  for (const [key, value] of entries) {
    const normalizedKey = sanitizeKey(key);
    const matched = normalizedPatterns.some((pattern) => normalizedKey.includes(pattern));
    if (!matched) continue;

    if (value !== undefined) {
      if (value === null || (typeof value === "string" && value.trim() === "")) {
        return null; // Explicitly empty
      }
      return typeof value === "string" ? value.trim() : value;
    }
  }
  return undefined;
}

function deduplicateString(str = "") {
  if (!str || typeof str !== "string") return str;
  const trimmed = str.trim();
  const half = Math.floor(trimmed.length / 2);
  const first = trimmed.substring(0, half).trim();
  const second = trimmed.substring(half).trim();
  if (first === second) return first;
  return trimmed;
}

function normalizeTicket(input = {}) {
  const ticket = {
    ticket: pick(input, "Symphony Ticket", "SymphonyTicket", "ticket", "icket") ?? pickContains(input, ["ticket", "ticketno", "icket"]) ?? null,
    cid: pick(input, "Symphony CID", "SymphonyCID", "cid") ?? pickContains(input, ["cid", "circuitid"]) ?? null,
    port: pick(input, "Port", "interface", "port") ?? pickContains(input, ["port", "interface", "gigabitethernet", "ge0"]) ?? null,
    downTime: pick(input, "Down Time", "downTime", "downtime", "down_time") ?? pickContains(input, ["downtime", "down_time", "down-time"]) ?? null,
    actualDowntime: pick(input, "Actual Downtime", "actualDowntime", "actual", "actual_downtime") ?? pickContains(input, ["actual"]) ?? null,
    clearTime: pick(input, "Clear Time", "clearTime", "cleartime", "clear_time") ?? pickContains(input, ["cleartime", "clear_time", "clear-time"]) ?? null,
    total: pick(input, "Total", "total") ?? pickContains(input, ["total"]) ?? null,
    pending: pick(input, "Pending", "pending") ?? null,
    originate: deduplicateString(pick(input, "Originate", "originate", "origin", "from") ?? pickContains(input, ["originate", "origin", "from"]) ?? null),
    terminate: deduplicateString(pick(input, "Terminate", "terminate", "destination", "to") ?? pickContains(input, ["terminate", "destination", "to"]) ?? null),
  };

  return Object.values(ticket).some(Boolean) ? ticket : null;
}

function normalizeTickets(alert = {}) {
  if (Array.isArray(alert.tickets) && alert.tickets.length) {
    return alert.tickets.map((item) => normalizeTicket(item)).filter(Boolean);
  }

    const fallback = normalizeTicket(alert);
  return fallback ? [fallback] : [];
}
function isEmptyLike(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return normalized === "" || normalized === "-" || normalized.toLowerCase() === "n/a";
}

function buildTicketKey(ticket = {}, fallbackIndex = 0) {
  const ticketNo = (ticket.ticket || "").toString().trim();
  const cid = (ticket.cid || "").toString().trim();

  if (ticketNo) {
    return ticketNo.toLowerCase();
  }

  if (cid) {
    return `cid:${cid.toLowerCase()}`;
  }

  return `__index_${fallbackIndex}`;
}
function mergeTicketLists(existingTickets = [], incomingTickets = []) {
  const byKey = new Map();

  existingTickets.forEach((ticket, index) => {
    const key = buildTicketKey(ticket, index);
    byKey.set(key, { ...(ticket || {}) });
  });

  incomingTickets.forEach((ticket, index) => {
    const key = buildTicketKey(ticket, index);

    if (!byKey.has(key)) {
      byKey.set(key, { ...(ticket || {}) });
      return;
    }

    const existing = byKey.get(key) || {};
    const merged = { ...existing };

    Object.entries(ticket || {}).forEach(([field, value]) => {
      // Overwrite if provided (even if null or empty)
      if (value !== undefined) {
        merged[field] = value;
      }
    });

    byKey.set(key, merged);
  });

  return Array.from(byKey.values());
}

function mergeAlertsByIncidentAndNode(alerts = []) {
  const grouped = new Map();

  alerts.forEach((alert) => {
    const incident = (alert.incident || pick(alert, "Incident", "incident") || "").toString().trim();
    const node = (alert.node || pick(alert, "Node", "node", "Node Name") || "-").toString().trim();
    if (!incident) return;

    const groupKey = `${incident.toLowerCase()}__${node.toLowerCase()}`;
    const existing = grouped.get(groupKey);

    if (!existing) {
      grouped.set(groupKey, {
        ...alert,
        incident,
        node,
        tickets: normalizeTickets(alert),
      });
      return;
    }

    existing.tickets = mergeTicketLists(existing.tickets || [], normalizeTickets(alert));
    existing.updatedAt = existing.updatedAt || alert.updatedAt || new Date().toISOString();
    if (!existing.createdAt || (alert.createdAt && alert.createdAt < existing.createdAt)) {
      existing.createdAt = alert.createdAt;
    }
  });

  return Array.from(grouped.values());
}

exports.handler = async () => {
  try {
    const db = getDb();
    const snapshot = await db.collection("appState").doc("noc-store").collection("alerts").get();

    const rawAlerts = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const alerts = mergeAlertsByIncidentAndNode(rawAlerts);

    return {
      statusCode: 200,
      body: JSON.stringify({ alerts }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "GET_ALERTS_FAILED" }),
    };
  }
};
