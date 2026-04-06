import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const bucket      = process.env.SUPABASE_BUCKET || "ad-creator";

  if (!supabaseUrl || !supabaseKey)
    return res.status(500).json({ error: "Supabase env variables belum dikonfigurasi" });

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { imageBase64, imageMediaType, fileName } = req.body;
  if (!imageBase64 || !imageMediaType)
    return res.status(400).json({ error: "imageBase64 dan imageMediaType wajib diisi" });

  try {
    const buffer = Buffer.from(imageBase64, "base64");
    const ext    = imageMediaType.split("/")[1] || "jpg";
    const path   = `uploads/${Date.now()}-${(fileName || "foto").replace(/\s+/g, "-")}.${ext}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType: imageMediaType, upsert: true });

    if (error) throw new Error(error.message);

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    res.status(200).json({ url: urlData.publicUrl, path });
  } catch (err) {
    res.status(500).json({ error: "Gagal upload foto: " + err.message });
  }
}
