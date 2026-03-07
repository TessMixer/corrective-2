exports.handler = async function(event) {

  const data = JSON.parse(event.body || "{}");

  console.log("Incident received:", data);

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "received",
      incident: data.incident
    })
  };

};
