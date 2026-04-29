const { handlePreflight, withCors } = require('./_cors');
const { requireAuth } = require('./_auth');
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

function normalizeDocId(value = "") {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
}

function stripUndefined(obj) {
    if (Array.isArray(obj)) return obj.map(stripUndefined).filter(v => v !== undefined);
    if (obj !== null && typeof obj === "object") {
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, stripUndefined(v)])
        );
    }
    return obj;
}

// Query a sub-collection by incidentId field (tries multiple casing variants)
async function queryByIncidentId(colRef, rawId) {
    const candidates = [...new Set([rawId, rawId.toUpperCase(), rawId.toLowerCase()])];
    const results = new Map();

    for (const candidate of candidates) {
        try {
            const snap = await colRef.where("incidentId", "==", candidate).get();
            snap.docs.forEach((d) => results.set(d.id, d));
        } catch (_) {}
    }

    // Also try doc ID prefix scan: docs starting with normalizeDocId(rawId)__
    const prefix = normalizeDocId(rawId);
    if (prefix) {
        try {
            const snap = await colRef
                .where(admin.firestore.FieldPath.documentId(), ">=", prefix)
                .where(admin.firestore.FieldPath.documentId(), "<", prefix + "\uf8ff")
                .get();
            snap.docs.forEach((d) => results.set(d.id, d));
        } catch (_) {}
    }

    return Array.from(results.values());
}

async function _handler(event) {
    try {
        if (event.httpMethod !== "POST") {
            return { statusCode: 405, body: JSON.stringify({ error: "METHOD_NOT_ALLOWED" }) };
        }

        const payload = JSON.parse(event.body || "{}");
        const rawId = String(payload.incidentId || payload.incident_number || "").trim();
        if (!rawId) {
            return { statusCode: 400, body: JSON.stringify({ error: "INCIDENT_ID_REQUIRED" }) };
        }

        const completedAt = payload.completedAt || new Date().toISOString();
        const status = String(payload.status || "COMPLETE").trim().toUpperCase();
        const nsFinish = payload.nsFinish || null;

        const db = getDb();
        const storeRef = db.collection("appState").doc("noc-store");
        const alertsRef = storeRef.collection("alerts");
        const correctiveRef = storeRef.collection("corrective");

        const updateData = stripUndefined({
            status,
            completedAt,
            nsFinish,
            nsFinishTime: completedAt,
            updatedAt: completedAt,
        });

        // Targeted queries — no full collection scans
        const [alertDocs, correctiveDocs] = await Promise.all([
            queryByIncidentId(alertsRef, rawId),
            queryByIncidentId(correctiveRef, rawId),
        ]);

        const allDocs = [...alertDocs, ...correctiveDocs];

        // Write each doc individually so one failure doesn't block others
        const writeResults = await Promise.all(
            allDocs.map(async (docSnap) => {
                try {
                    await docSnap.ref.set(updateData, { merge: true });
                    return { id: docSnap.id, ok: true };
                } catch (err) {
                    console.error(`finish-incident: write failed for ${docSnap.id}:`, err.message);
                    return { id: docSnap.id, error: err.message };
                }
            })
        );

        const updatedCount = writeResults.filter(r => r.ok).length;
        const errors = writeResults.filter(r => r.error);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                success: true,
                updatedCount,
                ...(errors.length ? { writeErrors: errors } : {}),
            }),
        };
    } catch (error) {
        console.error("finish-incident fatal error:", error.message, error.stack);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: error.message || "FINISH_INCIDENT_FAILED" }),
        };
    }
}

// CORS-wrapped handler

exports.handler = async (event) => {
  const pre = handlePreflight(event);
  if (pre) return pre;
  const authErr = requireAuth(event);
  if (authErr) return withCors(authErr);
  const result = await _handler(event);
  return withCors(result);
};
