const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");

const firebaseConfig = {
 apiKey: process.env.FIREBASE_API_KEY,
 projectId: process.env.FIREBASE_PROJECT_ID,
 appId: process.env.FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {

 if(event.httpMethod !== "POST"){
  return {
   statusCode:405,
   body:"Method Not Allowed"
  };
 }

 try{

  const data = JSON.parse(event.body);

  const docRef = await addDoc(
   collection(db,"appState","noc-store","alerts"),
   {
    incident:data.incident,
    node:data.node,
    alarm:data.alarm,
    detail:data.detail,
    createdAt:new Date().toISOString(),
    nocBy:"System",
    severity:"Medium",
    status:"OPEN",
    tickets:[{
      ticket:data.ticket,
      cid:data.cid,
      port:data.port,
      downTime:data.downtime,
      actualDowntime:data.actual,
      clearTime:data.cleartime
    }]
   }
  );

  return{
   statusCode:200,
   body:JSON.stringify({
    status:"created",
    id:docRef.id
   })
  };

 }catch(err){

  return{
   statusCode:500,
   body:JSON.stringify({
    error:err.message
   })
  };

 }

};
