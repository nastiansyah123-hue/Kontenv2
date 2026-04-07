const LAOZHANG_BASE = "https://api.laozhang.ai";

const MODELS = {
  "nano-banana": {
    label: "Nano Banana",
    endpoint: "/v1beta/models/gemini-3-pro-image-preview:generateContent",
    imageSize: "1K",
  },
  "nano-banana-2": {
    label: "Nano Banana 2",
    endpoint: "/v1beta/models/gemini-3-pro-exp-image-preview:generateContent",
    imageSize: "4K",
  },
};

async function callNanoBanana(cfg, prompt, imageBase64, imageMediaType, apiKey) {
  const parts = [{ text: prompt }];

  if (imageBase64 && imageMediaType) {
    parts.push({
      inline_data: { mime_type: imageMediaType, data: imageBase64 }
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { imageSize: cfg.imageSize }
    }
  };

  const res = await fetch(`${LAOZHANG_BASE}${cfg.endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}: ${JSON.stringify(data)}`);

  const imgB64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!imgB64) throw new Error("Tidak ada gambar di response");

  return `data:image/png;base64,${imgB64}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, imageBase64, imageMediaType, model: modelKey, width, height } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt wajib diisi" });

  const apiKey = process.env.LAOZHANG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LAOZHANG_API_KEY belum dikonfigurasi" });

  const cfg = MODELS[modelKey] || MODELS["nano-banana"];

  try {
    const imageData = await callNanoBanana(cfg, prompt, imageBase64, imageMediaType, apiKey);
    return res.status(200).json({ imageData, modelUsed: cfg.label });

  } catch (err) {
    console.error(`[${cfg.label}] error:`, err.message);

    // Fallback ke Nano Banana jika Nano Banana 2 gagal
    if (modelKey === "nano-banana-2") {
      try {
        console.log("Fallback ke Nano Banana...");
        const fallbackData = await callNanoBanana(
          MODELS["nano-banana"], prompt, imageBase64, imageMediaType, apiKey
        );
        return res.status(200).json({ imageData: fallbackData, modelUsed: "Nano Banana (fallback)" });
      } catch (fbErr) {
        console.error("Fallback gagal:", fbErr.message);
      }
    }

    res.status(500).json({ error: `[${cfg.label}]: ${err.message}` });
  }
}
