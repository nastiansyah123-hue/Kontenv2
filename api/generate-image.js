const LAOZHANG_BASE = "https://api.laozhang.ai/v1";

const MODELS = {
  "gpt-image-1":        { label: "GPT-Image-1",       supportsRef: true,  model: "gpt-image-1",           endpoint: "/images/generations" },
  "sora-image":         { label: "Sora Image",         supportsRef: false, model: "sora_image",            endpoint: "/images/generations" },
  "seedream-4-5":       { label: "Seedream 4.5",       supportsRef: true,  model: "seedream-4-5-251128",   endpoint: "/images/generations" },
  "seedream-4-0":       { label: "Seedream 4.0",       supportsRef: true,  model: "seedream-4-0-250828",   endpoint: "/images/generations" },
  "flux-kontext-pro":   { label: "FLUX Kontext Pro",   supportsRef: true,  model: "flux-kontext-pro",      endpoint: "/images/generations" },
  "flux-kontext-max":   { label: "FLUX Kontext Max",   supportsRef: true,  model: "flux-kontext-max",      endpoint: "/images/generations" },
  "flux-pro":           { label: "FLUX Pro",           supportsRef: false, model: "flux-pro",              endpoint: "/images/generations" },
  "gemini-flash-image": { label: "Gemini Flash Image", supportsRef: false, model: "gemini-2.0-flash-exp",  endpoint: "/images/generations" },
  "gemini-flash-edit":  { label: "Gemini Flash Edit",  supportsRef: true,  model: "gemini-2.0-flash-exp",  endpoint: "/images/edits"       },
  "nano-banana-pro":    { label: "Nano Banana Pro",    supportsRef: false, model: "nano-banana-pro",       endpoint: "/images/generations" },
};

// Download gambar dari URL dan konvert ke base64
async function imageUrlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal download gambar: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const contentType = res.headers.get("content-type") || "image/png";
  return `data:${contentType};base64,${base64}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, imageBase64, imageMediaType, model: modelKey, width, height } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt wajib diisi" });

  const apiKey = process.env.LAOZHANG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LAOZHANG_API_KEY belum dikonfigurasi" });

  const cfg = MODELS[modelKey] || MODELS["sora-image"];
  const W = width  || 1024;
  const H = height || 1024;
  const enhancedPrompt = `${prompt}, professional advertising photography, commercial product shot, high quality, dramatic lighting, sharp focus`;

  const body = {
    model: cfg.model,
    prompt: enhancedPrompt,
    n: 1,
    size: `${W}x${H}`,
    response_format: "url",
  };

  // Tambah referensi foto produk jika model mendukung
  if (cfg.supportsRef && imageBase64) {
    body.image = `data:${imageMediaType};base64,${imageBase64}`;
  }

  try {
    const apiRes = await fetch(`${LAOZHANG_BASE}${cfg.endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      throw new Error(data.error?.message || `HTTP ${apiRes.status}: ${JSON.stringify(data)}`);
    }

    let imageUrl = data.data?.[0]?.url;
    let imageData = data.data?.[0]?.b64_json;

    if (!imageUrl && !imageData) throw new Error("Tidak ada gambar di response");

    // Konvert URL ke base64 untuk menghindari CORS di canvas
    if (imageUrl && !imageData) {
      const dataUrl = await imageUrlToBase64(imageUrl);
      return res.status(200).json({ imageData: dataUrl, modelUsed: cfg.label });
    }

    return res.status(200).json({
      imageData: `data:image/png;base64,${imageData}`,
      modelUsed: cfg.label
    });

  } catch (err) {
    console.error(`[${cfg.label}] error:`, err.message);

    // Fallback ke Sora Image
    if (modelKey !== "sora-image") {
      try {
        console.log("Fallback ke Sora Image...");
        const fb = await fetch(`${LAOZHANG_BASE}/images/generations`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "sora_image", prompt: enhancedPrompt, n: 1, size: `${W}x${H}`, response_format: "url" }),
        });
        const fbData = await fb.json();
        const fbUrl = fbData.data?.[0]?.url;
        if (fbUrl) {
          const dataUrl = await imageUrlToBase64(fbUrl);
          return res.status(200).json({ imageData: dataUrl, modelUsed: "Sora Image (fallback)" });
        }
      } catch (fbErr) {
        console.error("Fallback gagal:", fbErr.message);
      }
    }

    res.status(500).json({ error: `[${cfg.label}]: ${err.message}` });
  }
}
