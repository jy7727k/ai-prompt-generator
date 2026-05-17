import express from "express";
import multer from "multer";
import "dotenv/config";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_MODEL = process.env.GOOGLE_IMAGE_MODEL || "gemini-2.0-flash-preview-image-generation";

app.use(express.static("."));

app.options("/api/generate-image", (_req, res) => {
  res.sendStatus(204);
});

function extractImageBase64(geminiResponse) {
  const candidates = geminiResponse?.candidates;
  if (!Array.isArray(candidates)) return null;

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      const data = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;
      if (typeof data === "string" && data.length > 0) {
        return { data, mimeType: mimeType || "image/png" };
      }
    }
  }

  return null;
}

app.post("/api/generate-image", upload.single("image"), async (req, res) => {
  try {
    if (!GOOGLE_API_KEY) {
      return res.status(500).json({
        error: "GOOGLE_API_KEY is not set. Add it in Render environment variables.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Image file is missing." });
    }

    const prompt = req.body.prompt || "Create a cute emoji sticker image.";
    const imageBase64 = req.file.buffer.toString("base64");

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: req.file.mimetype || "image/png",
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || `Google API error (HTTP ${response.status})`;
      return res.status(response.status).json({ error: message });
    }

    const generated = extractImageBase64(data);
    if (!generated) {
      return res.status(500).json({
        error: "No image data returned from Google model. Check model access and quota.",
      });
    }

    return res.json({ imageBase64: generated.data, mimeType: generated.mimeType });
  } catch (error) {
    console.error("[google image generation error]", error);
    return res.status(500).json({
      error: error?.message || "Image generation failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Image generation provider: Google Gemini");
});
