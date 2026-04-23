exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    return { statusCode: 200, body: JSON.stringify({ error: "IMGBB_API_KEY not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { image } = payload; // base64 string (with or without data: prefix)
  if (!image) {
    return { statusCode: 400, body: "Missing image" };
  }

  // Strip data URL prefix if present
  const base64 = image.replace(/^data:image\/\w+;base64,/, "");

  try {
    const form = new URLSearchParams();
    form.append("key", apiKey);
    form.append("image", base64);

    const res = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: form,
    });

    const json = await res.json();
    if (!json.success) {
      console.error("ImgBB error:", JSON.stringify(json));
      return { statusCode: 200, body: JSON.stringify({ error: "ImgBB upload failed" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ url: json.data.url }) };
  } catch (err) {
    console.error("upload-image error:", err);
    return { statusCode: 200, body: JSON.stringify({ error: err.message }) };
  }
};
