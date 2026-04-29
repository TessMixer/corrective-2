const { handlePreflight, withCors } = require('./_cors');
async function _handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const gasUrl = process.env.GAS_WEBHOOK_URL;
  const rawIds = process.env.LINE_GROUP_IDS || process.env.LINE_GROUP_ID || "";
  const groupIds = rawIds.split(",").map((s) => s.trim()).filter(Boolean);

  if (!token && !gasUrl) {
    console.warn("LINE env vars not configured");
    return { statusCode: 200, body: JSON.stringify({ skipped: true }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { incidentId, node, workType, updateNo, message, etr, subcontractors, cause, imageUrls = [], isFinish = false } = payload;

  const now = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let text;
  if (isFinish) {
    // NS Finish — ส่ง report text ตรงๆ
    text = [
      `✅ Finish`,
      `━━━━━━━━━━━━━━`,
      message || "-",
      ``,
      `🕐 ${now}`,
    ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  } else {
    const etrText = etr ? `⏱ ETR: ${etr}` : "";
    const subText = subcontractors?.length ? `🔧 Sub: ${subcontractors.join(", ")}` : "";
    const causeText = cause ? `📌 Cause: ${cause}` : "";
    const updateLabel = updateNo ? `Update#${updateNo}` : "Update";
    text = [
      `🔔 ${updateLabel}`,
      `━━━━━━━━━━━━━━`,
      `📋 ${incidentId || "-"}`,
      `🌐 Node: ${node || "-"}`,
      `🔩 Type: ${workType || "-"}`,
      ``,
      `📝 ${message || "-"}`,
      causeText,
      etrText,
      subText,
      ``,
      `🕐 ${now}`,
    ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // ส่งผ่าน LINE API โดยตรง (core function)
  async function sendViaLineApi() {
    if (!token || !groupIds.length) return { skipped: true, reason: "no_token_or_group" };
    const results = await Promise.all(
      groupIds.map(async (groupId) => {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            to: groupId,
            messages: [{ type: "text", text }],
          }),
        });
        const resText = await res.text();
        if (!res.ok) {
          console.error(`LINE API error [${groupId}]:`, res.status, resText);
          return { groupId, error: resText };
        }
        return { groupId, ok: true };
      })
    );
    return { via: "line", results };
  }

  try {
    // ลองส่งผ่าน GAS ก่อน — ถ้า GAS ตอบ error หรือ throw ให้ fallback ไป LINE API โดยตรง
    if (gasUrl) {
      let gasOk = false;
      let gasStatus = 0;
      let gasBody = "";
      try {
        const res = await fetch(gasUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nocNotify: true, text, imageUrls }),
        });
        gasStatus = res.status;
        gasBody = await res.text();
        gasOk = res.ok;
        console.log("GAS response:", gasStatus, gasBody);
      } catch (gasErr) {
        console.warn("GAS fetch failed:", gasErr.message);
      }

      if (gasOk) {
        return { statusCode: 200, body: JSON.stringify({ via: "gas", gasStatus, gasBody, ok: true }) };
      }

      // GAS failed or errored — fallback to LINE API directly
      console.warn("GAS not ok (status:", gasStatus, ") — falling back to LINE API direct");
      const fallback = await sendViaLineApi();
      return { statusCode: 200, body: JSON.stringify({ via: "gas_fallback", gasStatus, gasBody, ...fallback }) };
    }

    // ไม่มี GAS_WEBHOOK_URL — ส่งผ่าน LINE API โดยตรง
    const result = await sendViaLineApi();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error("notify-line error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}

// CORS-wrapped handler

exports.handler = async (event) => {
  const pre = handlePreflight(event);
  if (pre) return pre;
  const result = await _handler(event);
  return withCors(result);
};
