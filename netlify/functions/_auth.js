// Shared auth helper for Netlify functions
// Current: validates x-api-key header against NOC_API_SECRET env var
// TODO: upgrade to Firebase ID Token when login system is added

function requireAuth(event) {
  const secret = process.env.NOC_API_SECRET;

  // If no secret configured, skip check (allows local dev without env setup)
  if (!secret) return null;

  const provided = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"] || "";
  if (provided !== secret) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "UNAUTHORIZED" }),
    };
  }
  return null; // authorized
}

module.exports = { requireAuth };
