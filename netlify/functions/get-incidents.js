const { handlePreflight, withCors } = require('./_cors');
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
        return null;
      }
      return typeof value === "string" ? value.trim() : value;
    }
  }
  return undefined;
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
        return null;
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

function mergeTicketLists(existingTickets = [], incomingTickets = []) {
  const byKey = new Map();
  const buildKey = (t) => [t.ticket || "", t.cid || "", t.port || ""].join("::").toLowerCase();

  existingTickets.forEach((t) => byKey.set(buildKey(t), t));
  incomingTickets.forEach((t) => {
    const key = buildKey(t);
    if (!byKey.has(key)) {
      byKey.set(key, t);
    } else {
      byKey.set(key, { ...byKey.get(key), ...t });
    }
  });
  return Array.from(byKey.values());
}

function mergeAlertsByIncident(alerts = []) {
  const grouped = new Map();
  alerts.forEach((alert) => {
    const incident = (alert.incident || pick(alert, "Incident", "incident") || "").toString().trim();
    if (!incident) return;

    const groupKey = incident.toLowerCase();
    const existing = grouped.get(groupKey);

    if (!existing) {
      grouped.set(groupKey, {
        ...alert,
        incident,
        incidentId: incident,
        tickets: normalizeTickets(alert),
      });
      return;
    }

    // Merge tickets from all nodes into one entry
    existing.tickets = mergeTicketLists(existing.tickets || [], normalizeTickets(alert));

    // Prefer newer updatedAt
    const newTime = new Date(alert.updatedAt || 0).getTime();
    const existTime = new Date(existing.updatedAt || 0).getTime();
    if (newTime > existTime) {
      // Take newer fields but keep merged tickets and earliest createdAt
      const mergedTickets = existing.tickets;
      const createdAt = existing.createdAt && (!alert.createdAt || existing.createdAt < alert.createdAt)
        ? existing.createdAt : (alert.createdAt || existing.createdAt);
      Object.assign(existing, alert, { incident, incidentId: incident, tickets: mergedTickets, createdAt });
    } else {
      if (!existing.createdAt || (alert.createdAt && alert.createdAt < existing.createdAt)) {
        existing.createdAt = alert.createdAt;
      }
    }
  });
  return Array.from(grouped.values());
}
function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isCorrectiveOrHistoryStatus(status) {
  return [
    "PROCESS",
    "IN_PROGRESS",
    "RESPONDED",
    "CORRECTIVE",
    "COMPLETE",
    "FINISHED",
    "CLOSED",
    "RESOLVED",
    "DONE",
    "NS_FINISH",
  ].includes(status);
}
async function _handler(event) {

  try {
    let db;
    try {
      db = getDb();
    } catch (initErr) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: initErr.message || "DB_INIT_FAILED" }),
      };
    }

    const storeRef = db.collection("appState").doc("noc-store");

    // Netlify free tier hard limit = 10s. Firebase Admin cold start ~1-2s.
    // Keep per-query timeout at 6s so total stays safely under 10s.
    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`TIMEOUT: ${label} exceeded ${ms}ms`)), ms)
        ),
      ]);

    const [alertsSnap, correctiveSnap] = await Promise.all([
      withTimeout(storeRef.collection("alerts").get(), 6000, "alerts"),
      withTimeout(storeRef.collection("corrective").get(), 6000, "corrective"),
    ]);

    const subAlerts = alertsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const subCorrective = correctiveSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const alerts = [];
    const corrective = { fiber: [], equipment: [], other: [] };

    // Statuses that should NOT be returned to the client (soft-deleted / cancelled)
    const HIDDEN_STATUSES = ["CANCEL", "CANCELLED", "DELETED", "DELETE", "TRASH"];

    // Standardized distribution logic
    [...subAlerts, ...subCorrective].forEach((item) => {
      const status = (item.status || "").toUpperCase();

      // Skip soft-deleted / cancelled items — they have no place in any live list
      if (HIDDEN_STATUSES.includes(status)) return;

      const isCorrective = ["PROCESS", "IN_PROGRESS", "RESPONDED", "CORRECTIVE", "ACTION"].includes(status);
      const isHistory = ["COMPLETE", "FINISHED", "CLOSED", "RESOLVED", "DONE", "NS_FINISH"].includes(status);

      const type = String(item.workType || item.work_type || "Other").toLowerCase().trim();

      if (isCorrective || isHistory) {
        if (type.includes("fiber")) corrective.fiber.push(item);
        else if (type.includes("equipment")) corrective.equipment.push(item);
        else corrective.other.push(item);
      } else {
        alerts.push(item);
      }
    });

    // Keep per-node alerts separate so the client can group them by incident ID.
    // Each Firestore doc = one node. Merging here would lose per-node data.
    const responseBody = JSON.stringify({
      alerts,
      corrective,
      meta: {
        subAlertCount: subAlerts.length,
        subCorrectiveCount: subCorrective.length,
      }
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Netlify CDN caches this response for 30 seconds
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=10",
      },
      body: responseBody,
    };
  } catch (error) {
    const isTimeout = error.message && error.message.startsWith("TIMEOUT:");
    // On timeout return empty payload so the client doesn't crash with 502/500
    if (isTimeout) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Timeout": "true",
        },
        body: JSON.stringify({
          alerts: [],
          corrective: { fiber: [], equipment: [], other: [] },
          meta: { timeout: true, reason: error.message },
        }),
      };
    }
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message || "GET_INCIDENTS_FAILED",
      }),
    };
  }
}

// CORS-wrapped handler
exports.handler = async (event) => {
  const pre = handlePreflight(event);
  if (pre) return pre;
  const result = await _handler(event);
  return withCors(result);
};
