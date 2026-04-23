exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const events = body.events || [];
    events.forEach((e) => {
      console.log("LINE event:", JSON.stringify(e));
    });
  } catch (err) {
    console.log("parse error:", err.message);
  }
  return { statusCode: 200, body: "OK" };
};
