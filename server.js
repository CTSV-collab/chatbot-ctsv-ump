const express = require("express");
const fs = require("fs");
const path = require("path");
const stringSimilarity = require("string-similarity");

const app = express();

// Render + public API: nên giới hạn body
app.use(express.json({ limit: "32kb" }));

// Static site
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Healthcheck
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
        const questionsOk =
          Array.isArray(item.questions) && item.questions.length > 0;
        const answerOk =
          typeof item.answer === "string" && item.answer.trim().length > 0;

        if (!questionsOk || !answerOk) {
          console.warn(`⚠️ Bỏ qua item lỗi trong ${file}`);
          continue;
        }

        intents.push({
          ...item,
          questionsNorm: item.questions.map((q) => normalize(q)).filter(Boolean)
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
   GIỜ LÀM VIỆC THEO NGÀY
===================== */
function getVietnamWeekday() {
  const s = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "long"
  }).format(new Date());

  return s.replace(/^./, (c) => c.toUpperCase());
}

function isWeekendVN(weekday) {
  const w = normalize(weekday);
  return w.includes("chu nhat") || w.includes("thu bay");
}

function buildWorkingHoursAnswer() {
  return (
    "Phòng Công tác sinh viên làm việc từ thứ Hai đến thứ Sáu.<br>" +
    "<b>Buổi sáng:</b> 07h00–11h30<br>" +
    "<b>Buổi chiều:</b> 13h00–16h30<br>" +
    "Phòng không làm việc vào thứ Bảy, Chủ nhật và các ngày lễ theo quy định."
  );
}

function buildSessionAnswer(session) {
  if (session === "morning") {
    return (
      "<b>Sáng nay:</b> 07h00–11h30.<br>" +
      "Nếu em cần hỗ trợ thêm, em có thể đến trong giờ hành chính nhé."
    );
  }

  if (session === "afternoon") {
    return (
      "<b>Chiều nay:</b> 13h00–16h30.<br>" +
      "Nếu em cần hỗ trợ thêm, em có thể đến trong giờ hành chính nhé."
    );
  }

  return buildWorkingHoursAnswer();
}

function detectTodaySession(questionNorm) {
  if (questionNorm.includes("sang nay")) return "morning";
  if (questionNorm.includes("chieu nay")) return "afternoon";
  if (questionNorm.includes("hom nay")) return "today";
  return null;
}

/* =====================
   FALLBACK
===================== */
function buildFallbackAnswer() {
  return (
    "Xin lỗi, câu hỏi của em có thể không nằm trong phạm vi hỗ trợ tự động của Chatbot.<br>" +
    "Em vui lòng liên hệ trực tiếp Phòng CTSV để được giải đáp:<br><br>" +
    "📞 <b>Điện thoại:</b> 028.3853.7976<br>" +
    "📧 <b>Email:</b> ctsv@ump.edu.vn<br><br>" +
    "Phòng CTSV sẽ hỗ trợ em trong thời gian làm việc."
  );
}

/* =====================
   CHAT API
===================== */
app.post("/chat", async (req, res) => {
  try {
    const questionRaw = (req.body?.question || "").toString().trim();

    if (!questionRaw) {
      return res.json({ answer: "⚠️ Không nhận được câu hỏi." });
    }

    console.log("📝 Question:", questionRaw);

    const questionNorm = normalize(questionRaw);

    // =====================
    // Rule ưu tiên: cuối tuần
    // =====================
    const mentionsWeekend =
      questionNorm.includes("thu bay") ||
      questionNorm.includes("chu nhat") ||
      questionNorm.includes("cuoi tuan");

    if (mentionsWeekend) {
      return res.json({
        answer:
          "Phòng không làm việc vào thứ Bảy, Chủ nhật và các ngày lễ theo quy định."
      });
    }

    // =====================
    // Rule ưu tiên: giờ làm việc hôm nay
    // =====================
    const session = detectTodaySession(questionNorm);

    const askingWorkingTime =
      questionNorm.includes("phong") ||
      questionNorm.includes("ctsv") ||
      questionNorm.includes("gio lam") ||
      questionNorm.includes("thoi gian lam") ||
      questionNorm.includes("lam viec") ||
      questionNorm.includes("may gio") ||
      questionNorm.includes("den may gio") ||
      questionNorm.includes("mo cua") ||
      questionNorm.includes("dong cua");

    if (session && askingWorkingTime) {
      const weekday = getVietnamWeekday();

      if (isWeekendVN(weekday)) {
        return res.json({
          answer:
            `Hôm nay là <b>${weekday}</b> nên Phòng <b>không làm việc</b>.<br>` +
            "Phòng không làm việc vào thứ Bảy, Chủ nhật và các ngày lễ theo quy định."
        });
      }

      if (session === "morning") {
        return res.json({ answer: buildSessionAnswer("morning") });
      }

      if (session === "afternoon") {
        return res.json({ answer: buildSessionAnswer("afternoon") });
      }

      return res.json({
        answer: `Hôm nay là <b>${weekday}</b>. ` + buildWorkingHoursAnswer()
      });
    }

    // =====================
    // MATCH INTENT
    // =====================
    let bestMatch = null;
    let bestScore = 0;

    for (const intent of intents) {
      for (const qNorm of intent.questionsNorm) {
        // match chứa cụm từ rõ nghĩa
        if (qNorm.length >= 8 && questionNorm.includes(qNorm)) {
          let score = 1;

          // giảm nhẹ ưu tiên nhóm học bổng để tránh bias
          if (intent.intent.includes("hoc_bong")) {
            score = score * 0.9;
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = intent;
          }
          continue;
        }

        let score = stringSimilarity.compareTwoStrings(questionNorm, qNorm);

        // giảm nhẹ bias học bổng
        if (intent.intent.includes("hoc_bong")) {
          score = score * 0.9;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = intent;
        }
      }
    }

    console.log({
      score: Number(bestScore.toFixed(3)),
      intent: bestMatch?.intent || "NO_MATCH"
    });

    const THRESHOLD = 0.4;

    // Không match hoặc match yếu -> fallback
    if (!bestMatch || bestScore < THRESHOLD) {
      return res.json({
        answer: buildFallbackAnswer()
      });
    }

    // Match đúng
    return res.json({
      answer: bestMatch.answer
    });
  } catch (err) {
    console.error("❌ /chat error:", err);
    return res.status(200).json({
      answer:
        "Hệ thống đang bận hoặc gặp lỗi tạm thời.<br>Em vui lòng thử lại sau hoặc liên hệ trực tiếp Phòng CTSV để được hỗ trợ."
    });
  }
});

/* =====================
   START SERVER
===================== */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("🤖 Chatbot CTSV chạy tại port", PORT);
});