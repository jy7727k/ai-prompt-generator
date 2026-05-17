import express from "express";
import multer from "multer";
import OpenAI from "openai";
import "dotenv/config";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.static("."));

function findImageGenerationResult(response) {
  if (!response || !Array.isArray(response.output)) return null;

  for (const item of response.output) {
    if (item.type === "image_generation_call" && item.result) {
      return item.result;
    }
  }

  return null;
}

app.options("/api/generate-image", (_req, res) => {
  res.sendStatus(204);
});

app.post("/api/generate-image", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("여기에_")) {
      return res.status(500).json({
        error: ".env 파일에 OPENAI_API_KEY가 설정되지 않았습니다. .env.example을 .env로 복사한 뒤 새 API 키를 넣으세요.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "이미지 파일이 없습니다." });
    }

    const prompt = req.body.prompt || "Create a cute emoji sticker image.";
    const base64Image = req.file.buffer.toString("base64");
    const imageDataUrl = `data:${req.file.mimetype};base64,${base64Image}`;

    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Use the uploaded image as the visual identity reference. Create the requested image based on this prompt: " +
                prompt,
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
            },
          ],
        },
      ],
      tools: [{ type: "image_generation" }],
    });

    const imageBase64 = findImageGenerationResult(response);

    if (!imageBase64) {
      return res.status(500).json({
        error: "이미지 생성 결과가 없습니다. 모델 또는 계정의 이미지 생성 권한을 확인하세요.",
      });
    }

    return res.json({ imageBase64 });
  } catch (error) {
    console.error("[image generation error]", error);
    return res.status(500).json({
      error: error.message || "이미지 생성 실패",
    });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log("API 키는 .env 파일의 OPENAI_API_KEY에서만 읽습니다.");
});
