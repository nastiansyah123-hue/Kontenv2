import Anthropic from "@anthropic-ai/sdk";

const LAYOUTS = ["center", "left", "bottom", "overlay"];
const STYLES  = ["geometric", "minimal", "bold", "luxury", "organic"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { mode, imageBase64, imageMediaType, currentPrompt, prompt, qty } = req.body;

  try {
    // ── ASSIST MODE ──
    if (mode === "assist") {
      const content = [];
      if (imageBase64) content.push({ type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } });
      content.push({ type: "text", text: `Kamu adalah copywriter iklan profesional. Lihat foto produk ini${currentPrompt ? ` dan gunakan konteks: "${currentPrompt}"` : ""}.

Tulis 1 prompt deskripsi iklan dalam Bahasa Indonesia yang natural, persuasif, dan spesifik (maks 2-3 kalimat).
Balas HANYA teks promptnya saja.` });

      const msg = await client.messages.create({ model: "claude-opus-4-5", max_tokens: 300, messages: [{ role: "user", content }] });
      return res.status(200).json({ prompt: msg.content[0].text.trim() });
    }

    // ── GENERATE MODE ──
    if (mode === "generate") {
      const n = Math.min(Math.max(parseInt(qty) || 3, 1), 8);
      const content = [];
      if (imageBase64) content.push({ type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } });
      content.push({ type: "text", text: `Kamu adalah creative director iklan profesional. Lihat foto produk dan buat ${n} variasi konten iklan.

Brief: ${prompt}

Buat tepat ${n} variasi BERBEDA. Tiap variasi punya angle dan tone unik.
Layout pilihan: ${LAYOUTS.join(", ")}
Style pilihan: ${STYLES.join(", ")}
schemeIndex: gunakan angka 0 sampai 5, berbeda tiap variasi.

Balas HANYA dengan JSON valid berikut, tanpa teks lain, tanpa markdown:
{"variations":[{"brand":"nama brand maks 15 karakter","headline":"tagline maks 5 kata","subtext":"manfaat maks 10 kata","cta":"CTA maks 3 kata","schemeIndex":0,"layout":"center","style":"geometric","imagePrompt":"product photo prompt in English max 20 words"}]}` });

      const msg = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content }]
      });

      let raw = msg.content[0].text.trim();

      // Bersihkan markdown jika ada
      raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();

      // Pastikan JSON lengkap dengan menghitung bracket
      const opens  = (raw.match(/\{/g) || []).length;
      const closes = (raw.match(/\}/g) || []).length;
      const aOpens  = (raw.match(/\[/g) || []).length;
      const aCloses = (raw.match(/\]/g) || []).length;
      for (let i = 0; i < (aOpens - aCloses); i++) raw += "]";
      for (let i = 0; i < (opens - closes); i++)   raw += "}";

      const data = JSON.parse(raw);

      // Pastikan jumlah variasi sesuai request
      if (data.variations && data.variations.length > n) {
        data.variations = data.variations.slice(0, n);
      }

      return res.status(200).json(data);
    }

    res.status(400).json({ error: "Mode tidak dikenal" });
  } catch (err) {
    console.error("Claude error:", err);
    res.status(500).json({ error: "Gagal: " + err.message });
  }
}
