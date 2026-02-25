const express = require("express");
const fs = require("fs");
const path = require("path");
const stringSimilarity = require("string-similarity");

const app = express();

// Render + public API: nên giới hạn body
app.use(express.json({ limit: "32kb" }));

// Static site (nếu web service cũng serve public folder)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Healthcheck (Render useful)
app.get("/healthz", (req, res) => res.status(200).send("ok"));

/* =====================
   NORMALIZE TIẾNG VIỆT
===================== */
function normalize(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =====================
   LOAD DATA (cache normalize)
===================== */
function loadData() {
  const dataDir = path.join(__dirname, "data");
  const intents = [];

  if (!fs.existsSync(dataDir)) {
    console.warn("⚠️ Không tìm thấy thư mục data/");
    return intents;
  }

  for (const file of fs.readdirSync(dataDir)) {
    if (!file.endsWith(".json")) continue;

    try {
      const raw = fs.readFileSync(path.join(dataDir, file), "utf8");
      const data = JSON.parse(raw);

      if (!Array.isArray(data)) continue;

      for (const item of data) {
        const questionsOk = Array.isArray(item.questions) && item.questions.length > 0;
        const answerOk = typeof item.answer === "string" && item.answer.trim().length > 0;

        if (!questionsOk || !answerOk) {
          console.warn(`⚠️ Bỏ qua item lỗi trong ${file}`);
          continue;
        }

        // cache normalize sẵn
        intents.push({
          ...item,
          questionsNorm: item.questions.map(q => normalize(q)).filter(Boolean)
        });
      }
    } catch (err) {
      console.error(`❌ Lỗi file ${file}:`, err.message);
    }
  }

  return intents;
}

const intents = loadData();
console.log(`📚 Đã load ${intents.length} intent`);

/* =====================
   CHAT API
===================== */
app.post("/chat", async (req, res) => {
  const questionRaw = (req.body?.question || "").toString().trim();
  if (!questionRaw) {
    return res.json({ answer: "⚠️ Không nhận được câu hỏi." });
  }

  // Debug log (Render logs)
  console.log("📝 Question:", questionRaw);

  const question = normalize(questionRaw);
  let bestMatch = null;
  let bestScore = 0;

  // Dùng for...of để có thể break thật
  for (const intent of intents) {
    for (const qNorm of intent.questionsNorm) {
      // match chứa cụm từ (ưu tiên tuyệt đối)
      if (qNorm.length >= 10 && question.includes(qNorm)) {
        bestScore = 1;
        bestMatch = intent;
        break;
      }

      const score = stringSimilarity.compareTwoStrings(question, qNorm);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = intent;
      }
    }
    if (bestScore === 1) break;
  }

  console.log({
    score: Number(bestScore.toFixed(3)),
    intent: bestMatch?.intent || "NO_MATCH"
  });

  // Bạn có thể tăng ngưỡng lên 0.35 nếu thấy trả lời nhầm
  const THRESHOLD = 0.25;

  if (bestMatch && bestScore >= THRESHOLD) {
    return res.json({ answer: bestMatch.answer });
  }

  return res.json({
    answer:
      "🤔 Mình chưa chắc chắn câu hỏi này. Bạn có thể hỏi theo cách khác hoặc liên hệ trực tiếp Phòng CTSV nhé!"
  });
});

/* =====================
   START SERVER
===================== */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("🤖 Chatbot CTSV chạy tại port", PORT);
});