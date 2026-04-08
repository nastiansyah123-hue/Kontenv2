const LAOZHANG_BASE = "https://api.laozhang.ai";

const MODELS = {
  "nano-banana":   { label: "Nano Banana",   type: "gemini", endpoint: "/v1beta/models/gemini-3-pro-image-preview:generateContent",    imageSize: "1K" },
  "nano-banana-2": { label: "Nano Banana 2", type: "gemini", endpoint: "/v1beta/models/gemini-3.1-flash-image-preview:generateContent", imageSize: "4K" },
  "seedream-4-5":  { label: "Seedream 4.5",  type: "openai", model: "seedream-4-5-251128" },
};

function getAspectRatio(w, h) {
  const r = w / h;
  if (Math.abs(r - 1)      < 0.05) return "1:1";
  if (Math.abs(r - 9/16)   < 0.05) return "9:16";
  if (Math.abs(r - 16/9)   < 0.05) return "16:9";
  if (Math.abs(r - 4/5)    < 0.05) return "4:5";
  if (Math.abs(r - 5/4)    < 0.05) return "5:4";
  if (Math.abs(r - 3/4)    < 0.05) return "3:4";
  if (Math.abs(r - 4/3)    < 0.05) return "4:3";
  return "1:1";
}

async function imageUrlToBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal download: ${res.status}`);
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  return `data:${res.headers.get("content-type") || "image/png"};base64,${b64}`;
}

// Gemini native format
async function callGemini(cfg, prompt, imageBase64, imageMediaType, W, H, apiKey) {
  const parts = [{ text: prompt }];
  if (imageBase64 && imageMediaType) {
    parts.push({ inline_data: { mime_type: imageMediaType, data: imageBase64 } });
  }
  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { imageSize: cfg.imageSize, aspectRatio: getAspectRatio(W, H) }
    }
  };
  const res = await fetch(`${LAOZHANG_BASE}${cfg.endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error("Tidak ada gambar di response");
  return `data:image/png;base64,${b64}`;
}

// Seedream — format sesuai dokumentasi laozhang.ai
async function callOpenAI(cfg, prompt, imageUrl, W, H, apiKey) {
  // Seedream pakai size "1K"/"2K" bukan pixel dimension
  const aspectRatio = getAspectRatio(W, H);
  // Seedream pakai ratio format berbeda
  const ratioMap = {
    "1:1": "1:1", "9:16": "9:16", "16:9": "16:9",
    "4:5": "4:5", "5:4": "5:4", "3:4": "3:4", "4:3": "4:3"
  };
  const body = {
    model: cfg.model,
    prompt,
    response_format: "url",
    size: "2K",
    watermark: false,
  };
  // Tambah ratio jika bukan 1:1
  if (aspectRatio !== "1:1") {
    body.aspect_ratio = ratioMap[aspectRatio] || "1:1";
  }
  // Image-to-image: kirim URL foto produk
  if (imageUrl) {
    body.image = imageUrl;
  }
  console.log("Seedream request body:", JSON.stringify({ ...body, prompt: body.prompt.slice(0, 50) + "..." }));
  const res = await fetch(`${LAOZHANG_BASE}/v1/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Seedream full error:", JSON.stringify(data));
    throw new Error(data.error?.message || data.message || JSON.stringify(data));
  }
  const url = data.data?.[0]?.url;
  const b64 = data.data?.[0]?.b64_json;
  if (b64) return `data:image/png;base64,${b64}`;
  if (url) return await imageUrlToBase64(url);
  throw new Error("Tidak ada gambar di response");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, imageBase64, imageMediaType, imageUrl, model: modelKey, width, height } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt wajib diisi" });

  const apiKey = process.env.LAOZHANG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LAOZHANG_API_KEY belum dikonfigurasi" });

  const cfg = MODELS[modelKey] || MODELS["nano-banana"];
  const W = width || 1080, H = height || 1080;

  // Enhance prompt dengan instruksi teks yang clean dan profesional
  const enhancedPrompt = `${prompt}

TYPOGRAPHY RULES (strictly follow):
- Maximum 1 short headline (3-5 words, bold, large white text with dark shadow)
- Maximum 1 short subtext (5-8 words, smaller white text)
- 1 CTA button with rounded corners
- Clean sans-serif font only
- All text must be legible and well-positioned
- NO cluttered text, NO small text, NO decorative fonts
- Text placement: top or bottom area, not overlapping the product`;

  try {
    let imageData;
    if (cfg.type === "openai") {
      imageData = await callOpenAI(cfg, enhancedPrompt, imageUrl, W, H, apiKey);
    } else {
      imageData = await callGemini(cfg, enhancedPrompt, imageBase64, imageMediaType, W, H, apiKey);
    }
    return res.status(200).json({ imageData, modelUsed: cfg.label });

  } catch (err) {
    console.error(`[${cfg.label}] error:`, err.message);

    // Fallback ke Nano Banana
    if (modelKey !== "nano-banana") {
      try {
        const fallback = await callGemini(MODELS["nano-banana"], enhancedPrompt, imageBase64, imageMediaType, W, H, apiKey);
        return res.status(200).json({ imageData: fallback, modelUsed: "Nano Banana (fallback)" });
      } catch (fbErr) {
        console.error("Fallback gagal:", fbErr.message);
      }
    }

    res.status(500).json({ error: `[${cfg.label}]: ${err.message}` });
  }
}
