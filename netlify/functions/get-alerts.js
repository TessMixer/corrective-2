const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

exports.handler = async () => {

  const snapshot = await db
    .collection("appState")
    .doc("noc-store")
    .collection("alerts")
    .orderBy("createdAt", "desc")
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
