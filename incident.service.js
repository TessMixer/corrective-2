import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-analytics.js";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

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

async function loadCloudState() {
  const snapshot = await getDoc(stateDocRef);
  if (!snapshot.exists()) {
    return null;
  }

  const payload = snapshot.data() || {};
  return {
    alerts: Array.isArray(payload.alerts) ? payload.alerts : [],
    corrective: payload.corrective || { fiber: [], equipment: [], other: [] },
  };
}

async function saveCloudState(nextState) {
  const payload = {
    alerts: Array.isArray(nextState.alerts) ? nextState.alerts : [],
    corrective: nextState.corrective || { fiber: [], equipment: [], other: [] },
    updatedAt: serverTimestamp(),
  };

  await setDoc(stateDocRef, payload, { merge: true });
}

async function initFirebase() {
  try {
    const supported = await isSupported();
    if (supported) {
      analytics = getAnalytics(app);
    }

    window.FirebaseSync = {
      loadCloudState,
      saveCloudState,
    };

    return { app, db, analytics };
  } catch (error) {
    console.warn("Firebase initialization warning:", error);
    return { app, db, analytics: null };
  }
}

export { app, db, analytics, initFirebase };