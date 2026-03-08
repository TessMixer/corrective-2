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

function normalizeTicket(input = {}) {
  const ticket = {
    ticket: input.ticket || input.symphonyTicket || null,
    cid: input.cid || null,
    port: input.port || null,
    downTime: input.downTime || input.downtime || null,
    actualDowntime: input.actualDowntime || input.actual || null,
    clearTime: input.clearTime || input.cleartime || null,
    total: input.total || null,
    pending: input.pending || null,
    originate: input.originate || null,
    terminate: input.terminate || null,
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

  existingTickets.forEach((ticket, index) => {
    const key = ticket?.ticket ? ticket.ticket.toString().trim() : `__index_${index}`;
    byKey.set(key, { ...(ticket || {}) });
  });

  incomingTickets.forEach((ticket, index) => {
    const key = ticket?.ticket ? ticket.ticket.toString().trim() : `__incoming_${index}`;

    if (!byKey.has(key)) {
      byKey.set(key, { ...(ticket || {}) });
      return;
    }

    const existing = byKey.get(key) || {};
    const merged = { ...existing };

    Object.entries(ticket || {}).forEach(([field, value]) => {
      const currentValue = existing[field];
      const hasCurrent = currentValue !== undefined && currentValue !== null && currentValue !== "";
      const hasIncoming = value !== undefined && value !== null && value !== "";

      if (!hasCurrent && hasIncoming) {
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
    const incident = (alert.incident || alert.incidentId || alert.id || "").toString().trim();
    const node = (alert.node || "-").toString().trim();
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
