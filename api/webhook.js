// 1C Biznes Analitika — Telegram AI Agent
// Vercel Serverless Function

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const C1_BASE_URL = process.env.C1_BASE_URL;
const C1_USERNAME = process.env.C1_USERNAME;
const C1_PASSWORD = process.env.C1_PASSWORD;
const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS?.split(",").map(Number) || [];

// ─── 1C API sorğuları ─────────────────────────────────────────────────────────

async function fetchFrom1C(endpoint) {
  const url = `${C1_BASE_URL}/${endpoint}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "ngrok-skip-browser-warning": "true",
    },
  });

  if (!res.ok) throw new Error(`API xəta: ${res.status}`);
  return res.json();
}

async function getSalesReport() {
  try {
    return await fetchFrom1C("sales");
  } catch (e) {
    return { error: e.message };
  }
}

async function getStats() {
  try {
    return await fetchFrom1C("stats");
  } catch (e) {
    return { error: e.message };
  }
}

async function getInventory() {
  try {
    return await fetchFrom1C("inventory");
  } catch (e) {
    return { error: e.message };
  }
}

// ─── AI intent müəyyən etmə ───────────────────────────────────────────────────

async function determineIntent(userMessage) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content: `İstifadəçinin mesajını oxu və hansı məlumat lazım olduğunu JSON formatında qaytar.
Cavab yalnız JSON olmalıdır.
Format: {"intents": ["sales", "inventory", "stats"]}
Mümkün intentlər: sales (satışlar), inventory (anbar), stats (statistika, hesabat, mənfəət)`,
        },
        { role: "user", content: userMessage },
      ],
    }),
  });
  const data = await res.json();
  try {
    const text = data.choices[0].message.content.trim();
    return JSON.parse(text).intents || ["sales"];
  } catch {
    return ["sales"];
  }
}

// ─── AI cavab hazırlama ───────────────────────────────────────────────────────

async function generateAnswer(userMessage, businessData) {
  const today = new Date().toLocaleDateString("az-AZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `Sən şirkətin 1C sistemindəki bütün məlumatlara çıxışı olan ağıllı biznes analitik assistentisən.
Tarix: ${today}

Xüsusiyyətlərin:
- Azərbaycan dilində aydın, peşəkar, amma dostane cavab verirsən
- Rəqəmləri analiz edirsən, sadəcə siyahılamırsan
- Həmişə konkret tövsiyə verirsən
- Müqayisə aparırsan
- Emojidən ağıllı istifadə edirsən (📊 📈 ⚠️ ✅)
- Əgər məlumat əldə etmək mümkün olmayıbsa, bunu açıq deyirsən

Cavab formatı — Telegram Markdown:
*Başlıq* — bold
\`rəqəm\` — code formatı
• — siyahı elementi`,
        },
        {
          role: "user",
          content: `Sual: ${userMessage}\n\n1C-dən gələn məlumat:\n${JSON.stringify(businessData, null, 2)}`,
        },
      ],
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Məlumatı emal edərkən xəta baş verdi.";
}

// ─── Telegram mesaj göndər ────────────────────────────────────────────────────

async function sendTelegramMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

// ─── Ana handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  const message = update?.message;
  if (!message) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text || "";

  if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
    await sendTelegramMessage(chatId, "⛔ Giriş icazəniz yoxdur.");
    return res.status(200).json({ ok: true });
  }

  if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      `👋 Salam! Mən şirkətinizin *1C Biznes Assistentiyəm*.

Məndən soruşa bilərsiniz:
📊 *Satışlar* — "Bu ay satışlar necədir?"
📦 *Anbar* — "Anbar vəziyyəti necədir?"
📈 *Statistika* — "Ümumi hesabat ver"

Sadəcə sualınızı yazın! 🚀`
    );
    return res.status(200).json({ ok: true });
  }

  await sendTelegramMessage(chatId, "⏳ Analiz edirəm...");

  try {
    const intents = await determineIntent(text);

    const businessData = {};
    if (intents.includes("sales")) businessData.sales = await getSalesReport();
    if (intents.includes("inventory")) businessData.inventory = await getInventory();
    if (intents.includes("stats")) businessData.stats = await getStats();

    const answer = await generateAnswer(text, businessData);
    await sendTelegramMessage(chatId, answer);
  } catch (err) {
    console.error(err);
    await sendTelegramMessage(
      chatId,
      "❌ Xəta baş verdi: " + err.message
    );
  }

  return res.status(200).json({ ok: true });
}
