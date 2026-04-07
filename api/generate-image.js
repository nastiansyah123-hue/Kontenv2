// Semua model via laozhang.ai — OpenAI-compatible API
// Base URL: https://api.laozhang.ai/v1
// Docs: https://docs.laozhang.ai

const LAOZHANG_BASE = "https://api.laozhang.ai/v1";

const MODELS = {
  // ── GPT Image (OpenAI) ──
  "gpt-image-1": {
    label: "GPT-Image-1 (ChatGPT)",
    price: "~$0.02/img",
    supportsRef: true,
    type: "openai-image",
  },

  // ── Sora Image ──
  "sora-image": {
    label: "Sora Image",
    price: "$0.01/img",
    supportsRef: false,
    type: "openai-image",
    model: "sora_image",
  },

  // ── Seedream (ByteDance) ──
  "seedream-4-5": {
    label: "Seedream 4.5",
    price: "$0.045/img",
    supportsRef: true,
    type: "seedream",
    model: "seedream-4-5-251128",
  },
  "seedream-4-0": {
    label: "Seedream 4.0",
    price: "$0.035/img",
    supportsRef: true,
    type: "seedream",
    model: "seedream-4-0-250828",
  },

  // ── FLUX (via laozhang) ──
  "flux-kontext-pro": {
    label: "FLUX Kontext Pro",
    price: "$0.07/img",
    supportsRef: true,
    type: "flux",
    model: "flux-kontext-pro",
  },
  "flux-kontext-max": {
    label: "FLUX Kontext Max",
    price: "$0.07/img",
    supportsRef: true,
    type: "flux",
    model: "flux-kontext-max",
  },
  "flux-pro": {
    label: "FLUX Pro",
    price: "$0.035/img",
    supportsRef: false,
    type: "flux",
    model: "flux-pro",
  },

  // ── Gemini Flash (Google) ──
  "gemini-flash-image": {
    label: "Gemini Flash Image",
    price: "$0.025/img",
    supportsRef: false,
    type: "gemini",
    model: "gemini-2.0-flash-exp",
  },
  "gemini-flash-edit": {
    label: "Gemini Flash Edit",
    price: "$0.025/img",
    supportsRef: true,
    type: "gemini-edit",
    model: "gemini-2.0-flash-exp",
  },

  // ── Nano Banana ──
  "nano-banana-pro": {
    label: "Nano Banana Pro",
    price: "$0.05/img",
    supportsRef: false,
    type: "nano",
    model: "nano-banana-pro",
  },
};

async function callLaozhang(endpoint, body, apiKey) {
  const res = await fetch(`${LAOZHANG_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { prompt, imageBase64, imageMediaType, model: modelKey, width, height } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt wajib diisi" });

  const apiKey = process.env.LAOZHANG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "LAOZHANG_API_KEY belum dikonfigurasi" });

  const cfg = MODELS[modelKey] || MODELS["gpt-image-1"];
  const W = width || 1024;
  const H = height || 1024;
  const enhancedPrompt = `${prompt}, professional advertising photography, commercial product shot, high quality, dramatic lighting, sharp focus`;

  try {
    let imageUrl = null;

    // ── GPT-Image-1 & Sora Image ──
    if (cfg.type === "openai-image") {
      const body = {
        model: cfg.model || modelKey,
        prompt: enhancedPrompt,
        n: 1,
        size: `${W}x${H}`,
        response_format: "url",
      };
      // GPT-Image-1 support upload referensi via messages format
      if (cfg.supportsRef && imageBase64) {
        // Pakai chat completions dengan vision untuk GPT-Image-1
        const chatBody = {
          model: "gpt-image-1",
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${imageMediaType};base64,${imageBase64}` } },
                { type: "text", text: enhancedPrompt },
              ],
            },
          ],
          response_format: { type: "url" },
        };
        const data = await callLaozhang("/images/generations", body, apiKey);
        imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;
        if (data.data?.[0]?.b64_json) {
          imageUrl = `data:image/png;base64,${data.data[0].b64_json}`;
        }
      } else {
        const data = await callLaozhang("/images/generations", body, apiKey);
        imageUrl = data.data?.[0]?.url;
        if (data.data?.[0]?.b64_json) imageUrl = `data:image/png;base64,${data.data[0].b64_json}`;
      }
    }

    // ── Seedream (image-to-image support) ──
    else if (cfg.type === "seedream") {
      const body = {
        model: cfg.model,
        prompt: enhancedPrompt,
        n: 1,
        size: `${W}x${H}`,
        response_format: "url",
      };
      if (cfg.supportsRef && imageBase64) {
        body.image = `data:${imageMediaType};base64,${imageBase64}`;
      }
      const data = await callLaozhang("/images/generations", body, apiKey);
      imageUrl = data.data?.[0]?.url;
    }

    // ── FLUX Kontext (image editing) ──
    else if (cfg.type === "flux") {
      const body = {
        model: cfg.model,
        prompt: enhancedPrompt,
        n: 1,
        size: `${W}x${H}`,
        response_format: "url",
      };
      if (cfg.supportsRef && imageBase64) {
        body.image = `data:${imageMediaType};base64,${imageBase64}`;
      }
      const data = await callLaozhang("/images/generations", body, apiKey);
      imageUrl = data.data?.[0]?.url;
    }

    // ── Gemini Flash Edit ──
    else if (cfg.type === "gemini-edit") {
      const body = {
        model: cfg.model,
        prompt: enhancedPrompt,
        n: 1,
        size: `${W}x${H}`,
        response_format: "url",
      };
      if (imageBase64) body.image = `data:${imageMediaType};base64,${imageBase64}`;
      const data = await callLaozhang("/images/edits", body, apiKey);
      imageUrl = data.data?.[0]?.url;
    }

    // ── Gemini Flash / Nano Banana (text-to-image) ──
    else {
      const body = {
        model: cfg.model,
        prompt: enhancedPrompt,
        n: 1,
        size: `${W}x${H}`,
        response_format: "url",
      };
      const data = await callLaozhang("/images/generations", body, apiKey);
      imageUrl = data.data?.[0]?.url;
    }

    if (!imageUrl) throw new Error("Tidak ada URL gambar di response");
    res.status(200).json({ imageUrl, modelUsed: cfg.label, price: cfg.price });
  } catch (err) {
    console.error(`[${cfg.label}] error:`, err.message);

    // Auto-fallback ke Sora Image jika model gagal
    if (modelKey !== "sora-image") {
      try {
        console.log("Fallback ke Sora Image...");
        const fallback = await callLaozhang("/images/generations", {
          model: "sora_image",
          prompt: enhancedPrompt,
          n: 1,
          size: `${W}x${H}`,
          response_format: "url",
        }, apiKey);
        const url = fallback.data?.[0]?.url;
        if (url) return res.status(200).json({ imageUrl: url, modelUsed: "Sora Image (fallback)", price: "$0.01" });
      } catch (fb) {
        console.error("Fallback juga gagal:", fb.message);
      }
    }

    res.status(500).json({ error: `Gagal generate [${cfg.label}]: ${err.message}` });
  }
}
