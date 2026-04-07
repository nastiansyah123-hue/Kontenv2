import Anthropic from "@anthropic-ai/sdk";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { mode, imageBase64, imageMediaType, currentPrompt, prompt, qty } = req.body;

  try {
    // ── ASSIST: Claude bantu tulis prompt iklan dari foto ──
    if (mode === "assist") {
      const content = [];
      if (imageBase64) content.push({
        type: "image",
        source: { type: "base64", media_type: imageMediaType, data: imageBase64 }
      });
      content.push({
        type: "text",
        text: `Kamu adalah creative director iklan profesional. Lihat foto produk ini${currentPrompt ? ` dan gunakan konteks: "${currentPrompt}"` : ""}.

Tulis prompt untuk AI image generator yang akan membuat konten iklan LENGKAP (gambar + teks iklan menyatu).
Prompt harus dalam Bahasa Inggris dan mencakup:
- Deskripsi produk dan apa yang harus ada di gambar
- Teks headline iklan yang harus muncul di gambar (bold, eye-catching)
- Sub-teks manfaat produk
- CTA button text
- Background/setting yang cocok
- Gaya desain (modern, premium, natural, dll)

Format: tulis langsung prompt-nya saja dalam Bahasa Inggris, tanpa penjelasan.
Contoh format: "Create a professional advertisement for [product]. Include bold headline text '[HEADLINE]', subtext '[BENEFIT]', CTA button '[CTA]'. Background: [setting]. Style: [style]."

Balas HANYA prompt Bahasa Inggris-nya saja.`
      });

      const msg = await client.messages.create({
        model: "claude-opus-4-5", max_tokens: 500,
        messages: [{ role: "user", content }]
      });
      return res.status(200).json({ prompt: msg.content[0].text.trim() });
    }

    // ── GENERATE: buat N image prompts berbeda ──
    if (mode === "generate") {
      const n = Math.min(Math.max(parseInt(qty) || 3, 1), 8);
      const content = [];
      if (imageBase64) content.push({
        type: "image",
        source: { type: "base64", media_type: imageMediaType, data: imageBase64 }
      });
      content.push({
        type: "text",
        text: `Kamu adalah creative director iklan profesional. Lihat foto produk dan buat ${n} variasi prompt untuk AI image generator.

Brief dari user: ${prompt}

Setiap prompt harus menghasilkan gambar iklan LENGKAP dengan:
- Foto produk yang prominent di gambar
- Teks headline iklan yang bold dan eye-catching (dalam Bahasa Indonesia)
- Sub-teks manfaat
- Tombol/teks CTA
- Background yang menarik dan relevan
- Layout profesional seperti iklan Instagram/Facebook

Buat ${n} variasi BERBEDA dalam hal:
- Angle/komposisi (produk di tengah, di samping, close-up, dll)
- Background (studio, alam, lifestyle, gradient, dll)  
- Gaya desain (modern minimalis, bold colorful, premium elegant, natural organic, dll)
- Warna dominan

Balas HANYA dengan JSON valid ini, tanpa teks lain:
{
  "variations": [
    {
      "imagePrompt": "detailed English prompt for AI image generator to create complete ad with product photo, headline text, subtext, CTA button, background - all in one image. Max 80 words.",
      "headline": "Teks headline dalam Bahasa Indonesia",
      "style": "nama gaya desain"
    }
  ]
}`
      });

      const msg = await client.messages.create({
        model: "claude-opus-4-5", max_tokens: 4096,
        messages: [{ role: "user", content }]
      });

      let raw = msg.content[0].text.trim().replace(/```json[\s\S]*?```|```/g, "").trim();
      const opens = (raw.match(/\{/g)||[]).length - (raw.match(/\}/g)||[]).length;
      const aOpens = (raw.match(/\[/g)||[]).length - (raw.match(/\]/g)||[]).length;
      for (let i = 0; i < aOpens; i++) raw += "]";
      for (let i = 0; i < opens; i++) raw += "}";

      return res.status(200).json(JSON.parse(raw));
    }

    res.status(400).json({ error: "Mode tidak dikenal" });
  } catch (err) {
    console.error("Claude error:", err);
    res.status(500).json({ error: "Gagal: " + err.message });
  }
}
