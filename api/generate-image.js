const LAOZHANG_BASE = "https://api.laozhang.ai";

const MODELS = {
  "nano-banana":   { label: "Nano Banana",   type: "gemini", endpoint: "/v1beta/models/gemini-3-pro-image-preview:generateContent",    imageSize: "1K" },
  "nano-banana-2": { label: "Nano Banana 2", type: "gemini", endpoint: "/v1beta/models/gemini-3.1-flash-image-preview:generateContent", imageSize: "4K" },
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
  // Retry hingga 3x jika server overload
  const MAX_RETRY = 3;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    const res = await fetch(`${LAOZHANG_BASE}${cfg.endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    // Jika server overload, tunggu dan coba lagi
    if (!res.ok) {
      const msg = data.error?.message || JSON.stringify(data);
      const isOverload = msg.includes("饱和") || msg.includes("overload") || msg.includes("rate") || res.status === 429 || res.status === 503;
      if (isOverload && attempt < MAX_RETRY) {
        console.warn(`Overload, retry ${attempt}/${MAX_RETRY} in 3s...`);
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      throw new Error(msg);
    }
    const b64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) throw new Error("Tidak ada gambar di response");
    return `data:image/png;base64,${b64}`;
  }
}



export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, imageBase64, imageMediaType, model: modelKey, width, height } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt wajib diisi" });

  const apiKey = process.env.LAOZHANG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LAOZHANG_API_KEY belum dikonfigurasi" });

  const cfg = MODELS[modelKey] || MODELS["nano-banana"];
  const W = width || 1080, H = height || 1080;

  // Serahkan semua ke AI — produk, background, teks, layout
  const enhancedPrompt = `Create a complete professional advertisement image for: ${prompt}

RULES:
- Include the actual product from the reference photo prominently in the center
- Add compelling headline text (3-5 words, bold, large) at top
- Add short benefit text (5-8 words) at bottom
- Add CTA button at bottom
- Beautiful background that matches product theme
- Clean modern ad layout like Instagram/Facebook ads
- Text must be clear, legible, professional sans-serif font`;

  try {
    let imageData;
    imageData = await callGemini(cfg, enhancedPrompt, imageBase64, imageMediaType, W, H, apiKey);
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
