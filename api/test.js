export default async function handler(req, res) {
  const apiKey = process.env.LAOZHANG_API_KEY;
  
  if (!apiKey) {
    return res.status(200).json({ status: "ERROR", message: "LAOZHANG_API_KEY tidak ada di env" });
  }

  try {
    const response = await fetch("https://api.laozhang.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sora_image",
        prompt: "a red apple on white background",
        n: 1,
        size: "512x512",
        response_format: "url",
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(200).json({ 
        status: "API_ERROR", 
        httpStatus: response.status,
        error: data 
      });
    }

    return res.status(200).json({ 
      status: "SUCCESS", 
      imageUrl: data.data?.[0]?.url,
      raw: data
    });
  } catch (err) {
    return res.status(200).json({ status: "FETCH_ERROR", message: err.message });
  }
}
