const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

exports.handler = async (event) => {

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  try {

    const data = JSON.parse(event.body);

    const docRef = await db
      .collection("appState")
      .doc("noc-store")
      .collection("alerts")
      .add({
        incident: data.incident,
        node: data.node,
        alarm: data.alarm,
        detail: data.detail,
        createdAt: new Date().toISOString(),
        nocBy: "System",
        severity: "Medium",
        status: "OPEN",
        tickets: [{
          ticket: data.ticket,
          cid: data.cid,
          port: data.port,
          downTime: data.downtime,
          actualDowntime: data.actual,
          clearTime: data.cleartime
        }]
      });

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "created",
        id: docRef.id
      })
    };

  } catch (err) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };

  }

};
