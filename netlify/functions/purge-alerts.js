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

function normalizeIdentifier(value = "") {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const db = getDb();
    const storeRef = db.collection("appState").doc("noc-store");
    const alertsRef = storeRef.collection("alerts");
    const correctiveRef = storeRef.collection("corrective");

    const storeSnap = await storeRef.get();
    const storeData = storeSnap.exists ? storeSnap.data() || {} : {};
    let legacyAlerts = Array.isArray(storeData.alerts) ? storeData.alerts : [];
    let legacyCorrective = storeData.corrective || { fiber: [], equipment: [], other: [] };
    let legacyChanged = false;

    if (body.purgeAll === true) {
      const allAlerts = await alertsRef.get();
      const allCorrective = await correctiveRef.get();
      const batch = db.batch();
      allAlerts.docs.forEach((doc) => batch.delete(doc.ref));
      allCorrective.docs.forEach((doc) => batch.delete(doc.ref));
      
      // Also clear legacy fields
      batch.set(storeRef, { 
        alerts: admin.firestore.FieldValue.delete(), 
        corrective: admin.firestore.FieldValue.delete() 
      }, { merge: true });

      await batch.commit();

      return { statusCode: 200, body: JSON.stringify({ status: "purged_all", deleted: allAlerts.size + allCorrective.size }) };
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "ITEMS_REQUIRED" }) };
    }

    let deleted = 0;
    const batch = db.batch();
    
    for (const item of items) {
      const incident = (item.incident || item.id || "").toString().trim();
      const nodeString = (item.node || item.region || "-").toString().trim();
      if (!incident) continue;

      const incidentDocId = normalizeIdentifier(incident);

      // 1. Precise Incident Document (Corrective or New Alert format)
      const corrRef = correctiveRef.doc(incidentDocId);
      const corrSnap = await corrRef.get();
      if (corrSnap.exists) {
        batch.delete(corrRef);
        deleted += 1;
      }

      // 2. Alert Subcollection (Multiple docs per incident/node)
      // Try exact match first for Alerts
      const exactAlertId = `${normalizeIdentifier(incident)}__${normalizeIdentifier(nodeString)}`;
      const exactAlertDoc = alertsRef.doc(exactAlertId);
      const exactAlertSnap = await exactAlertDoc.get();
      if (exactAlertSnap.exists) {
        batch.delete(exactAlertDoc);
        deleted += 1;
      }

      // 3. Split Nodes (Comma separated alerts)
      if (nodeString.includes(",")) {
        const nodes = nodeString.split(",").map(n => n.trim()).filter(Boolean);
        for (const n of nodes) {
          const splitId = `${normalizeIdentifier(incident)}__${normalizeIdentifier(n)}`;
          const splitRef = alertsRef.doc(splitId);
          const splitSnap = await splitRef.get();
          if (splitSnap.exists) {
            batch.delete(splitRef);
            deleted += 1;
          }
        }
      }

      // 4. Legacy/Broad fallback for Alerts subcollection
      const legacySnap = await alertsRef.where("incident", "==", incident).get();
      legacySnap.docs.forEach(doc => {
        batch.delete(doc.ref);
        deleted += 1;
      });

      // 5. Cleanup Legacy Flat Arrays
      const initialAlertsCount = legacyAlerts.length;
      legacyAlerts = legacyAlerts.filter(la => {
        const laId = (la.id || la.incident || la.incidentId || "").toString().toLowerCase().trim();
        return laId !== incident.toLowerCase().trim();
      });
      if (legacyAlerts.length !== initialAlertsCount) legacyChanged = true;

      ["fiber", "equipment", "other"].forEach(typeKey => {
         const initialLen = legacyCorrective[typeKey].length;
         legacyCorrective[typeKey] = legacyCorrective[typeKey].filter(lc => {
             const lcId = (lc.id || lc.incident || lc.incidentId || lc.incident_number || "").toString().toLowerCase().trim();
             return lcId !== incident.toLowerCase().trim();
         });
         if (legacyCorrective[typeKey].length !== initialLen) legacyChanged = true;
      });
    }

    if (legacyChanged) {
      batch.set(storeRef, { 
        alerts: legacyAlerts, 
        corrective: legacyCorrective 
      }, { merge: true });
    }

    await batch.commit();

    return { statusCode: 200, body: JSON.stringify({ status: "purged_selected", deleted }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message || "PURGE_ALERTS_FAILED" }) };
  }
};