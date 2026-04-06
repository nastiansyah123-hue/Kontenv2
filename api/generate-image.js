export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt, imageUrl, model, width, height } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt wajib diisi" });

  const models = {
    "flux-free":     { id: "black-forest-labs/FLUX.1-schnell-Free",          steps: 4,  supportsImg: false },
    "flux-schnell":  { id: "black-forest-labs/FLUX.1-schnell",               steps: 4,  supportsImg: false },
    "wan-2-6":       { id: "Wan-AI/Wan2.6-image",                            steps: 28, supportsImg: true  },
    "flux-kontext":  { id: "black-forest-labs/FLUX.1-kontext-dev",           steps: 20, supportsImg: true  },
    "flux-1-1-pro":  { id: "black-forest-labs/FLUX.1.1-pro",                 steps: 25, supportsImg: true  },
    "flux-dev":      { id: "black-forest-labs/FLUX.1-dev",                   steps: 20, supportsImg: false },
    "sd-3-5":        { id: "stabilityai/stable-diffusion-3-5-large",         steps: 28, supportsImg: false },
    "sd-3-5-turbo":  { id: "stabilityai/stable-diffusion-3-5-large-turbo",   steps: 4,  supportsImg: false },
    "playground-v3": { id: "playgroundai/playground-v3",                     steps: 25, supportsImg: false },
  };

  const selected = models[model] || models["flux-free"];
  const payload  = {
    model: selected.id,
    prompt: `${prompt}, professional advertising photography, commercial product shot, high quality, sharp focus`,
    width: width || 1024, height: height || 1024,
    steps: selected.steps, n: 1, response_format: "url",
  };
  if (selected.supportsImg && imageUrl) payload.image_url = imageUrl;

  try {
    let resp = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Fallback ke FLUX Free jika model gagal
    if (!resp.ok) {
      resp = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, model: "black-forest-labs/FLUX.1-schnell-Free", steps: 4, image_url: undefined }),
      });
    }

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    res.status(200).json({ imageUrl: data.data[0].url, modelUsed: selected.id });
  } catch (err) {
    res.status(500).json({ error: "Gagal generate gambar: " + err.message });
  }
}
