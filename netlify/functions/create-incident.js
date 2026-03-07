import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

const firebaseConfig = {
 apiKey: process.env.FB_APIKEY,
 authDomain: process.env.FB_AUTHDOMAIN,
 projectId: process.env.FB_PROJECTID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function handler(event) {

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

}
