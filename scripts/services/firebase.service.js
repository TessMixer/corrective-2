import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-analytics.js";
import { doc, getDoc, getDocs, collection, getFirestore, serverTimestamp, setDoc, deleteDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBOZn013w18SkqeuwIkNrZuNoQn8wFhhq8",
  authDomain: "corrective-5bf09.firebaseapp.com",
  projectId: "corrective-5bf09",
  storageBucket: "corrective-5bf09.firebasestorage.app",
  messagingSenderId: "232500381090",
  appId: "1:232500381090:web:955fe78402180dba0d5efb",
  measurementId: "G-P2S04KG7KN",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const stateDocRef = doc(db, "appState", "noc-store");
let analytics = null;

function normalizeId(value = "") {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizeIncident(item) {
  if (!item || typeof item !== "object") return null;
  
  // Normalize ID - Strip suffixes like "__NodeName"
  const rawId = (item.incidentId || item.incident || item.id || item.incident_number || item.ticket || "").toString().trim();
  const incidentId = rawId.split("__")[0]; 
  
  // Reduced strictness: Allow IDs of at least 1 character.
  if (!incidentId || incidentId.length < 1) return null;

  // Normalize Status
  let status = String(item.status || "OPEN").toUpperCase();
  if (status === "ACTIVE") status = "OPEN"; 
  if (["NS_FINISH", "DONE", "FINISHED", "CLOSED", "RESOLVED"].includes(status)) status = "COMPLETE";
  if (["PROCESS", "IN_PROGRESS", "RESPONDED", "ACTION"].includes(status)) status = "CORRECTIVE";

  // Normalize Work Type
  const workType = String(item.workType || item.work_type || item.type || "-");

  return {
    ...item,
    incidentId,
    status,
    workType,
    updatedAt: item.updatedAt || item.updated_at || new Date().toISOString()
  };
}

async function loadCloudState() {
  console.info("Firebase: Loading cloud state (Sub-collections only)...");
  let rootPayload = {};
  let legacyRootData = null;
  try {
    const snapshot = await getDoc(stateDocRef);
    if (snapshot.exists()) {
      const data = snapshot.data() || {};
      rootPayload = {
        calendarEvents: Array.isArray(data.calendarEvents) ? data.calendarEvents : [],
        updatedAt: data.updatedAt
      };
      // Keep legacy root arrays for migration fallback
      legacyRootData = data;
    }
  } catch (error) {
    console.error("Firebase: Load root document failed:", error);
  }

  const processedMap = new Map();

  const mergeItemIntoState = (rawItem) => {
    const item = normalizeIncident(rawItem);
    if (!item) return;

    const isAlertStatus = !["COMPLETE","FINISHED","CLOSED","RESOLVED","COMPLETED","DONE","NS_FINISH",
      "CORRECTIVE","PROCESS","IN_PROGRESS","RESPONDED","ACTION"].includes(item.status);

    // Alerts: keep per-node separate using full doc ID so Alert Monitor shows one row per node.
    // Corrective/History: merge by stripped incidentId to deduplicate multi-node docs.
    const id = isAlertStatus
      ? (item.id || item.incidentId).toLowerCase()
      : item.incidentId.toLowerCase();

    if (processedMap.has(id)) {
      const existing = processedMap.get(id);
      
      const newTime = new Date(item.updatedAt || 0).getTime() || 0;
      const existingTime = new Date(existing.updatedAt || 0).getTime() || 0;
      
      // Determine which is base and which is overlay
      const newer = newTime >= existingTime ? item : existing;
      const older = newTime >= existingTime ? existing : item;

      // START SMART MERGE
      const merged = { ...older, ...newer };

      // 1. Array Merging (Updates)
      const combinedUpdates = [...(older.updates || []), ...(newer.updates || [])];
      const uniqueUpdates = [];
      const seenUpdates = new Set();
      combinedUpdates.forEach(u => {
        const key = `${u.at || ""}_${(u.message || "").substring(0, 50)}`;
        if (u.at && !seenUpdates.has(key)) {
          uniqueUpdates.push(u);
          seenUpdates.add(key);
        }
      });
      merged.updates = uniqueUpdates.sort((a,b) => new Date(a.at || 0) - new Date(b.at || 0));

      // 2. Array Merging (Tickets/Nodes)
      const mergeArrays = (oldArr, newArr, keyFn) => {
        const combined = [...(oldArr || []), ...(newArr || [])];
        const unique = new Map();
        combined.forEach(obj => {
          const k = keyFn(obj);
          if (k && !unique.has(k)) {
            unique.set(k, obj);
          } else if (k && unique.has(k)) {
             // Merge properties of same items
             unique.set(k, { ...unique.get(k), ...obj });
          }
        });
        return Array.from(unique.values());
      };

      const ticketKey = t => (t.ticket || t.symphonyTicket || t.cid || t.port || "");
      const nodeKey = n => (n.node || n.name || "");

      merged.tickets = mergeArrays(older.tickets, newer.tickets, ticketKey);
      merged.nodes = mergeArrays(older.nodes, newer.nodes, nodeKey);

      // 3. Object Merging (nsFinish)
      merged.nsFinish = newer.nsFinish || older.nsFinish || null;
      if (older.nsFinish && newer.nsFinish) {
         merged.nsFinish = {
           ...older.nsFinish,
           ...newer.nsFinish,
           details: { ...(older.nsFinish.details || {}), ...(newer.nsFinish.details || {}) },
           times: { ...(older.nsFinish.times || {}), ...(newer.nsFinish.times || {}) }
         };
      }

      // 4. Protect established fields from skeleton overwrites
      merged.node = newer.node || older.node || "";
      merged.alarm = newer.alarm || older.alarm || "";
      merged.detail = newer.detail || older.detail || "";
      merged.customerTrunk = newer.customerTrunk || older.customerTrunk || "";
      merged.cid = newer.cid || older.cid || "";
      merged.workType = (newer.workType && newer.workType !== "-") ? newer.workType : (older.workType || "-");

      if (combinedUpdates.length > (newer.updates?.length || 0)) {
        console.debug(`Firebase: Merged ${combinedUpdates.length - (newer.updates?.length || 0)} extra updates into ${id}`);
      }
      
      processedMap.set(id, merged);
    } else {
      processedMap.set(id, item);
    }
  };

  // Step 1: Load legacy root-level incident arrays (data saved before sub-collection migration).
  // Sub-collection data (loaded in Step 2) is newer and will win on merge conflicts.
  if (legacyRootData) {
    if (Array.isArray(legacyRootData.alerts)) {
      legacyRootData.alerts.forEach(item => mergeItemIntoState(item));
      console.info(`Firebase: Loaded ${legacyRootData.alerts.length} legacy alerts from root document.`);
    }
    const legacyCorrective = legacyRootData.corrective || {};
    ["fiber", "equipment", "other"].forEach(tab => {
      if (Array.isArray(legacyCorrective[tab])) {
        legacyCorrective[tab].forEach(item => mergeItemIntoState({ ...item, workType: item.workType || tab }));
        console.info(`Firebase: Loaded ${legacyCorrective[tab].length} legacy corrective.${tab} from root document.`);
      }
    });
  }

  // Step 2: Load sub-collection data (newer, authoritative — will override root data on merge).
  let alertsLoaded = false;
  let correctiveLoaded = false;

  try {
    const alertsSnap = await getDocs(collection(db, "appState", "noc-store", "alerts"));
    alertsSnap.forEach(doc => mergeItemIntoState({ ...doc.data(), id: doc.id }));
    console.info(`Firebase: Loaded ${alertsSnap.size} alerts from sub-collection.`);
    alertsLoaded = true;
  } catch (error) {
    console.warn("Firebase: Failed to load alerts sub-collection:", error);
  }

  try {
    const correctiveSnap = await getDocs(collection(db, "appState", "noc-store", "corrective"));
    correctiveSnap.forEach(doc => mergeItemIntoState({ ...doc.data(), id: doc.id }));
    console.info(`Firebase: Loaded ${correctiveSnap.size} corrective items from sub-collection.`);
    correctiveLoaded = true;
  } catch (error) {
    console.warn("Firebase: Failed to load corrective sub-collection:", error);
  }

  // If BOTH sub-collections failed (quota/network), signal failure so caller keeps local cache
  if (!alertsLoaded && !correctiveLoaded && processedMap.size === 0) {
    console.warn("Firebase: All sub-collection reads failed — returning null to preserve local cache.");
    return null;
  }

  const alerts = [];
  const corrective = { fiber: [], equipment: [], other: [] };

  const HIDDEN_STATUSES = ["CANCEL", "CANCELLED", "DELETED", "DELETE", "TRASH"];

  processedMap.forEach((item) => {
    const status = item.status;

    // Never surface soft-deleted / cancelled items back to the UI
    if (HIDDEN_STATUSES.includes(status)) return;

    const isHistory = ["COMPLETE", "FINISHED", "CLOSED", "RESOLVED", "COMPLETED", "DONE", "NS_FINISH"].includes(status);
    const isCorrective = ["PROCESS", "IN_PROGRESS", "RESPONDED", "CORRECTIVE", "ACTION"].includes(status);
    const type = item.workType.toLowerCase();

    if (isHistory || isCorrective) {
      if (type.includes("fiber")) corrective.fiber.push(item);
      else if (type.includes("equipment")) corrective.equipment.push(item);
      else corrective.other.push(item);
    } else {
      alerts.push(item);
    }
  });

  console.info(`Firebase: Cloud state merge complete. Total unique incidents: ${processedMap.size}`);

  return {
    alerts,
    corrective,
    calendarEvents: Array.isArray(rootPayload.calendarEvents) ? rootPayload.calendarEvents : [],
  };
}

async function saveCloudState(nextState) {
  if (!nextState) return;
  console.info("Firebase: Syncing metadata to root document...");

  const rootPayload = {
    calendarEvents: Array.isArray(nextState.calendarEvents) ? nextState.calendarEvents : [],
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(stateDocRef, rootPayload, { merge: true });
    console.info("Firebase: Root document metadata updated.");
  } catch (error) {
    console.error("Firebase: saveCloudState (Metadata) failed:", error);
  }
}

/**
 * Granularly saves a single incident to the correct sub-collection.
 * Prevents full-list overwrites and respects the sub-collection model.
 */
// Firestore ไม่รองรับ undefined — ต้อง strip ออกก่อนส่งทุกครั้ง
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

async function saveIncidentToCloud(incident) {
  const normalized = normalizeIncident(incident);
  if (!normalized) return;

  const incidentKey = normalizeId(normalized.incidentId);
  const nodeKey = normalizeId(normalized.node || "-");
  const docId = `${incidentKey}__${nodeKey}`;

  const status = normalized.status;
  const isCorrective = ["PROCESS", "IN_PROGRESS", "RESPONDED", "CORRECTIVE", "ACTION"].includes(status);
  const isHistory = ["COMPLETE", "FINISHED", "CLOSED", "RESOLVED", "DONE", "NS_FINISH"].includes(status);

  const targetCollection = (isCorrective || isHistory) ? "corrective" : "alerts";
  const otherCollection = targetCollection === "corrective" ? "alerts" : "corrective";
  const docRef = doc(db, "appState", "noc-store", targetCollection, docId);
  const otherDocRef = doc(db, "appState", "noc-store", otherCollection, docId);

  try {
    const safeData = stripUndefined({ ...normalized, updatedAt: serverTimestamp() });
    await setDoc(docRef, safeData, { merge: true });
    console.info(`Firebase: Saved incident ${docId} to ${targetCollection} sub-collection.`);

    // Cross-collection cleanup: remove stale copy from the other collection (e.g. when
    // an alert is responded and moved to corrective, delete the original alert doc).
    try {
      const otherSnap = await getDoc(otherDocRef);
      if (otherSnap.exists()) {
        await deleteDoc(otherDocRef);
        console.info(`Firebase: Removed stale ${docId} from ${otherCollection} sub-collection.`);
      }
    } catch (_) {
      // Non-critical: cross-cleanup failure doesn't break the main save
    }
  } catch (error) {
    console.error(`Firebase: Failed to save incident ${docId}:`, error);
    throw error;
  }
}

async function deleteIncidentFromCloud(incidentId) {
  if (!incidentId) return;
  const id = normalizeId(incidentId);

  // We need to check both collections since we don't know the status for sure here
  const collections = ["alerts", "corrective"];
  
  try {
    for (const col of collections) {
      const q = query(collection(db, "appState", "noc-store", col));
      const snap = await getDocs(q);
      const deletePromises = [];
      
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const itemId = normalizeId(data.incidentId || data.incident);
        if (itemId === id) {
          deletePromises.push(deleteDoc(docSnap.ref));
        }
      });
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.info(`Firebase: Deleted incident ${id} from ${col} sub-collection.`);
      }
    }
  } catch (error) {
    console.error(`Firebase: Failed to delete incident ${id}:`, error);
    throw error;
  }
}

// Real-time listener — fires instantly when Firestore changes
// Directly updates Store WITHOUT going through Netlify API (avoids 502)
function startRealtimeListener() {
  const alertsRef = collection(db, "appState", "noc-store", "alerts");
  const correctiveRef = collection(db, "appState", "noc-store", "corrective");

  const HIDDEN = ["CANCEL", "CANCELLED", "DELETED", "DELETE", "TRASH"];
  const CORRECTIVE_STATUS = ["PROCESS", "IN_PROGRESS", "RESPONDED", "CORRECTIVE", "ACTION"];
  const HISTORY_STATUS = ["COMPLETE", "FINISHED", "CLOSED", "RESOLVED", "DONE", "NS_FINISH"];

  let latestAlertsDocs = [];
  let latestCorrectiveDocs = [];

  function dispatchToStore() {
    if (!window.Store) return;

    // Build set of incident keys already in local corrective state so that stale
    // alert docs in Firestore don't overwrite a locally-responded incident before
    // the Firestore cleanup propagates (race condition window after Response click).
    const localState = Store.getState();
    const localCorrectiveKeys = new Set();
    ["fiber", "equipment", "other"].forEach((tab) => {
      (localState.corrective?.[tab] || []).forEach((a) => {
        const k = String(a.incidentId || a.incident || a.id || "").trim().toLowerCase().split("__")[0];
        if (k) localCorrectiveKeys.add(k);
      });
    });

    const allDocs = [...latestAlertsDocs, ...latestCorrectiveDocs];

    const alerts = [];
    const corrective = { fiber: [], equipment: [], other: [] };

    allDocs.forEach((item) => {
      const status = String(item.status || "").toUpperCase();
      if (HIDDEN.includes(status)) return;

      const isCorrective = CORRECTIVE_STATUS.includes(status);
      const isHistory = HISTORY_STATUS.includes(status);
      const type = String(item.workType || item.work_type || "Other").toLowerCase().trim();

      if (isCorrective || isHistory) {
        if (type.includes("fiber")) corrective.fiber.push(item);
        else if (type.includes("equipment")) corrective.equipment.push(item);
        else corrective.other.push(item);
      } else {
        // Suppress stale alert docs for incidents already moved to corrective locally
        const incKey = String(item.incidentId || item.incident || item.id || "").trim().toLowerCase().split("__")[0];
        if (incKey && localCorrectiveKeys.has(incKey)) return;
        alerts.push(item);
      }
    });

    console.info(`Firebase realtime: ${alerts.length} alerts, corrective: fiber=${corrective.fiber.length} equip=${corrective.equipment.length} other=${corrective.other.length}`);

    Store.dispatch((state) => ({ ...state, alerts, corrective }));
  }

  const unsubAlerts = onSnapshot(alertsRef, (snap) => {
    latestAlertsDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    dispatchToStore();
  }, (err) => {
    console.warn("Firebase realtime alerts error:", err);
  });

  const unsubCorrective = onSnapshot(correctiveRef, (snap) => {
    latestCorrectiveDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    dispatchToStore();
  }, (err) => {
    console.warn("Firebase realtime corrective error:", err);
  });

  console.info("Firebase: Realtime listeners started.");
  return () => { unsubAlerts(); unsubCorrective(); };
}

// Early assignment to window object to prevent race conditions
window.FirebaseSync = {
  loadCloudState,
  saveCloudState,
  saveIncidentToCloud,
  deleteIncidentFromCloud,
  startRealtimeListener,
};

async function initFirebase() {
  try {
    const supported = await isSupported();
    if (supported) {
      analytics = getAnalytics(app);
    }
    console.info("Firebase: Initialization successful.");
    return { app, db, analytics };
  } catch (error) {
    console.warn("Firebase: Initialization partial success (Analytics skipped):", error);
    return { app, db, analytics: null };
  }
}
export { app, db, analytics, initFirebase };