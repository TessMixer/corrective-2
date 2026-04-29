// Shared CORS helper for all Netlify functions
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || process.env.URL || "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function handlePreflight(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }
  return null;
}

function withCors(response) {
  return { ...response, headers: { ...(response.headers || {}), ...CORS_HEADERS } };
}

module.exports = { CORS_HEADERS, handlePreflight, withCors };
