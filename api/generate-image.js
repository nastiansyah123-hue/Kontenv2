const LAOZHANG_BASE = "https://api.laozhang.ai/v1";

const MODELS = {
  "nano-banana":   { label: "Nano Banana",   model: "nano-banana",   supportsRef: true },
  "nano-banana-2": { label: "Nano Banana 2", model: "nano-banana-2", supportsRef: true },
};

async function imageUrlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal download: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const b64 = Buffer.from(buffer).toString("base64");
  const ct = res.headers.get("content-type") || "image/png";
  return `data:${ct};base64,${b64}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, imageBase64, imageMediaType, model: modelKey, width, height } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt wajib diisi" });

  const apiKey = process.env.LAOZHANG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LAOZHANG_API_KEY belum dikonfigurasi" });

  const cfg = MODELS[modelKey] || MODELS["nano-banana"];
  const W = width  || 1024;
  const H = height || 1024;

  const body = {
    model: cfg.model,
    prompt,
    n: 1,
    size: `${W}x${H}`,
    response_format: "url",
  };

  // Kirim foto produk sebagai referensi
  if (cfg.supportsRef && imageBase64) {
    body.image = `data:${imageMediaType};base64,${imageBase64}`;
  }

  try {
    const apiRes = await fetch(`${LAOZHANG_BASE}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json();
    if (!apiRes.ok) throw new Error(data.error?.message || `HTTP ${apiRes.status}: ${JSON.stringify(data)}`);

    const imageUrl = data.data?.[0]?.url;
    const b64 = data.data?.[0]?.b64_json;

    if (b64) return res.status(200).json({ imageData: `data:image/png;base64,${b64}`, modelUsed: cfg.label });
    if (imageUrl) {
      const dataUrl = await imageUrlToBase64(imageUrl);
      return res.status(200).json({ imageData: dataUrl, modelUsed: cfg.label });
    }

    throw new Error("Tidak ada gambar di response");

  } catch (err) {
    console.error(`[${cfg.label}] error:`, err.message);

    // Fallback ke Nano Banana jika Nano Banana 2 gagal
    if (modelKey === "nano-banana-2") {
      try {
        console.log("Fallback ke Nano Banana...");
        const fb = await fetch(`${LAOZHANG_BASE}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, model: "nano-banana" }),
        });
        const fbData = await fb.json();
        const fbUrl = fbData.data?.[0]?.url;
        if (fbUrl) {
          const dataUrl = await imageUrlToBase64(fbUrl);
          return res.status(200).json({ imageData: dataUrl, modelUsed: "Nano Banana (fallback)" });
        }
      } catch (fbErr) {
        console.error("Fallback gagal:", fbErr.message);
      }
    }

    res.status(500).json({ error: `[${cfg.label}]: ${err.message}` });
  }
}
