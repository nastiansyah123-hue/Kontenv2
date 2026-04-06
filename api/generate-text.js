import Anthropic from "@anthropic-ai/sdk";

const LAYOUTS = ["center", "left", "bottom", "overlay"];
const STYLES  = ["geometric", "minimal", "bold", "luxury", "organic"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { mode, imageBase64, imageMediaType, currentPrompt, prompt, qty } = req.body;

  try {
    if (mode === "assist") {
      const content = [];
      if (imageBase64) content.push({ type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } });
      content.push({ type: "text", text: `Kamu adalah copywriter iklan profesional. Lihat foto produk ini${currentPrompt ? ` dan gunakan konteks: "${currentPrompt}"` : ""}.

Tulis 1 prompt deskripsi iklan dalam Bahasa Indonesia yang natural, persuasif, dan spesifik (maks 2-3 kalimat).
Balas HANYA teks promptnya saja.` });

      const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 300, messages: [{ role: "user", content }] });
      return res.status(200).json({ prompt: msg.content[0].text.trim() });
    }

    if (mode === "generate") {
      const n = Math.min(Math.max(parseInt(qty) || 3, 1), 8);
      const content = [];
      if (imageBase64) content.push({ type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } });
      content.push({ type: "text", text: `Kamu adalah creative director iklan profesional. Lihat foto produk dan buat ${n} variasi konten iklan berdasarkan brief:

Brief: ${prompt}

Buat ${n} variasi BERBEDA dengan angle, tone, dan image prompt yang unik.
Layout: ${LAYOUTS.join(", ")}
Style: ${STYLES.join(", ")}

Balas HANYA JSON valid ini:
{
  "variations": [
    {
      "brand": "nama brand (maks 18 karakter)",
      "headline": "tagline powerful (maks 6 kata)",
      "subtext": "manfaat produk (maks 12 kata)",
      "cta": "teks CTA (maks 4 kata)",
      "schemeIndex": 0,
      "layout": "center",
      "style": "geometric",
      "imagePrompt": "English prompt for Together AI image generation, product photography style, max 30 words"
    }
  ]
}

Gunakan schemeIndex 0-5, layout dan style berbeda tiap variasi.` });

      const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 2048, messages: [{ role: "user", content }] });
      const raw = msg.content[0].text.trim().replace(/```json[\s\S]*?```|```/g, "").trim();
      return res.status(200).json(JSON.parse(raw));
    }

    res.status(400).json({ error: "Mode tidak dikenal" });
  } catch (err) {
    res.status(500).json({ error: "Gagal: " + err.message });
  }
}
