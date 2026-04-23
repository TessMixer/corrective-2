async function uploadImagesToStorage(attachments) {
  const urls = [];
  if (!attachments || !attachments.length) return urls;

  for (const att of attachments) {
    if (!att.url || !att.url.startsWith("data:image/")) continue;
    try {
      const res = await fetch("/.netlify/functions/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: att.url }),
      });
      const json = await res.json();
      if (json.url) {
        urls.push(json.url);
      } else {
        console.warn("StorageService: upload failed for", att.name, json.error);
      }
    } catch (err) {
      console.warn("StorageService: upload error for", att.name, err.message);
    }
  }

  return urls;
}

window.StorageService = { uploadImagesToStorage };
