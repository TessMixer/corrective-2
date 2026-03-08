const admin = require("firebase-admin");

const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey
  })
});

const db = admin.firestore();

exports.handler = async () => {
  const snapshot = await db
  .collection("appState")
  .doc("noc-store")
  .collection("alerts")
  .get();

  const alerts = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ alerts })
  };
};

