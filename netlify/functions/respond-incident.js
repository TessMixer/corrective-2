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

function ticketKey(ticket = {}, index = 0) {
  const ticketNo = String(ticket.ticket || ticket.symphonyTicket || "").trim();
  const cid = String(ticket.cid || "").trim();
  const port = String(ticket.port || "").trim();
  const downTime = String(ticket.downTime || "").trim();

  return [ticketNo || `index-${index}`, cid, port, downTime].join("::").toLowerCase();
}

function mergeTickets(alerts = []) {
  const tickets = new Map();

  alerts.forEach((alert) => {
    const list = Array.isArray(alert.tickets) ? alert.tickets : [];

    list.forEach((ticket, index) => {
      const key = ticketKey(ticket, index);
      if (!tickets.has(key)) {
        tickets.set(key, {
          ticket: ticket.ticket || ticket.symphonyTicket || null,
          cid: ticket.cid || null,
          port: ticket.port || null,
          downTime: ticket.downTime || null,
          clearTime: ticket.clearTime || null,
        });
      }
    });
  });

  return Array.from(tickets.values());
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }) };
    }

    const payload = JSON.parse(event.body || "{}");
    const incidentNumber = String(payload.incident_number || payload.incident || "").trim();
    const eta = payload.eta || "-";
    const workType = payload.work_type || payload.workType || "Other";

    if (!incidentNumber) {
      return { statusCode: 400, body: JSON.stringify({ error: "INCIDENT_NUMBER_REQUIRED" }) };
    }

    const db = getDb();
    const storeRef = db.collection("appState").doc("noc-store");
    const alertsRef = storeRef.collection("alerts");
    const correctiveRef = storeRef.collection("corrective").doc(incidentNumber);

    // Query by all possible incident field names
    const [snap1, snap2, snap3] = await Promise.all([
      alertsRef.where("incident", "==", incidentNumber).get(),
      alertsRef.where("incidentId", "==", incidentNumber).get(),
      alertsRef.where("id", "==", incidentNumber).get(),
    ]);

    const seenIds = new Set();
    const allDocs = [];
    for (const snap of [snap1, snap2, snap3]) {
      for (const doc of snap.docs) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          allDocs.push(doc);
        }
      }
    }

    if (allDocs.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: "INCIDENT_NOT_FOUND" }) };
    }

    const alerts = allDocs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
    const nodes = [...new Set(alerts.map((item) => item.node).filter(Boolean))];
    const alarms = [...new Set(alerts.map((item) => item.alarm).filter(Boolean))];
    const mergedTickets = mergeTickets(alerts);

    const now = new Date().toISOString();

    await db.runTransaction(async (tx) => {
      // Firestore transactions require all reads to happen before writes.
      const existing = await tx.get(correctiveRef);
      const current = existing.exists ? existing.data() || {} : {};
      const payloadToSave = {
        incident_number: incidentNumber,
        incidentId: incidentNumber,
        node: nodes.join(", ") || current.node || "-",
        alarm: alarms.join(" | ") || current.alarm || "-",
        tickets: mergedTickets,
        root_cause: current.root_cause || "",
        solution: current.solution || "",
        remark: current.remark || "",
        status: "PROCESS",
        source_status: "Alert Monitor",
        target_status: "Corrective",
        work_type: workType,
        eta,
        updated_at: now,
        created_at: current.created_at || now,
      };

      tx.set(correctiveRef, payloadToSave, { merge: true });

      allDocs.forEach((alertDoc) => {
        tx.set(alertDoc.ref, {
          status: "PROCESS",
          workflowStage: "CORRECTIVE",
          correctiveIncident: incidentNumber,
          respondedAt: now,
          updatedAt: now,
        }, { merge: true });
      });

    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        incident_number: incidentNumber,
        moved_alert_rows: alerts.length,
        merged_tickets: mergedTickets.length,
        message: "INCIDENT_MOVED_TO_CORRECTIVE",
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "RESPOND_INCIDENT_FAILED" }),
    };
  }
};