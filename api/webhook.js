// 1C Biznes Analitika — Telegram AI Agent
// Vercel Serverless Function

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const C1_BASE_URL = process.env.C1_BASE_URL;       // http://YOUR_SERVER/1c/hs/...
const C1_USERNAME = process.env.C1_USERNAME;
const C1_PASSWORD = process.env.C1_PASSWORD;
const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS?.split(",").map(Number) || [];

// ─── 1C OData sorğuları ───────────────────────────────────────────────────────

async function fetchFrom1C(endpoint, params = "") {
  const url = `${C1_BASE_URL}/odata/standard.odata/${endpoint}?$format=json${params ? "&" + params : ""}`;
  const auth = Buffer.from(`${C1_USERNAME}:${C1_PASSWORD}`).toString("base64");

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`1C xəta: ${res.status} ${res.statusText}`);
  return res.json();
}

// Satış hesabatı — bu ay
async function getSalesReport() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  try {
    const data = await fetchFrom1C(
      "Document_ПродажаТоваровУслуг", // Satış sənədləri
      `$filter=Date ge datetime'${firstDay}T00:00:00' and Date le datetime'${lastDay}T23:59:59'&$select=Date,Number,Amount,Counterparty_Key`
    );
    return data.value || [];
  } catch (e) {
    return { error: e.message };
  }
}

// Anbar qalıqları
async function getInventory() {
  try {
    const data = await fetchFrom1C(
      "AccumulationRegister_ТоварыНаСкладах/Balance()", // Anbar qalıqları
      `$select=Nomenclature_Key,Warehouse_Key,QuantityBalance,AmountBalance`
    );
    return data.value || [];
  } catch (e) {
    return { error: e.message };
  }
}

// Ən çox satan məhsullar
async function getTopProducts(limit = 10) {
  try {
    const data = await fetchFrom1C(
      "AccumulationRegister_Продажи/Balance()",
      `$select=Nomenclature_Key,QuantityBalance,AmountBalance&$top=${limit}&$orderby=AmountBalance desc`
    );
    return data.value || [];
  } catch (e) {
    return { error: e.message };
  }
}

// Mənfəət/Zərər
async function getProfitLoss() {
  try {
    const data = await fetchFrom1C(
      "AccumulationRegister_ДоходыИРасходы/Balance()",
      `$select=Item_Key,AmountBalance`
    );
    return data.value || [];
  } catch (e) {
    return { error: e.message };
  }
}

// Debitor borclar
async function getReceivables() {
  try {
    const data = await fetchFrom1C(
      "AccumulationRegister_РасчетыСКлиентами/Balance()",
      `$select=Counterparty_Key,AmountBalance&$filter=AmountBalance gt 0`
    );
    return data.value || [];
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Hansı məlumatı çəkəcəyimizi AI ilə müəyyən edirik ───────────────────────

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
          content: `Sən bir 1C biznes analitika agentinin məntiq hissəsisən.
İstifadəçinin mesajını oxu və hansı məlumat lazım olduğunu JSON formatında qaytar.
Cavab yalnız JSON olmalıdır, heç bir əlavə mətn olmadan.
Format: {"intents": ["sales", "inventory", "products", "profit", "receivables"]}
Mümkün intent-lər: sales (satışlar), inventory (anbar/mallar), products (ən çox satan), profit (mənfəət/zərər/hesabat), receivables (borclar/debitor)
Bir neçə intent ola bilər.`,
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

// ─── AI ilə Azərbaycanca cavab hazırlama ─────────────────────────────────────

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
- Həmişə konkret tövsiyə verirsən ("Bu məhsulun ehtiyatı azalır, sifariş edin" kimi)
- Müqayisə aparırsan (bu ay vs keçən ay, plan vs fakt)
- Mənfəət marjasını hesablayırsan
- Emojidən ağıllı istifadə edirsən (📊 📈 ⚠️ ✅)
- Əgər məlumat əldə etmək mümkün olmayıbsa, bunu açıq deyirsən

Cavab formatı — Telegram Markdown:
*Başlıq* — bold
\`rəqəm\` — code formatı (pul məbləğləri üçün)
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

// ─── Telegram mesaj göndər ───────────────────────────────────────────────────

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

// ─── Ana handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const update = req.body;
  const message = update?.message;
  if (!message) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text || "";

  // İcazə yoxlaması
  if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(chatId)) {
    await sendTelegramMessage(chatId, "⛔ Giriş icazəniz yoxdur.");
    return res.status(200).json({ ok: true });
  }

  // /start əmri
  if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      `👋 Salam! Mən şirkətinizin *1C Biznes Assistentiyəm*.

Məndən soruşa bilərsiniz:
📊 *Satışlar* — "Bu ay satışlar necədir?"
📦 *Anbar* — "Hansı malların ehtiyatı azdır?"
💰 *Mənfəət* — "Bu rübdə mənfəət nə qədərdir?"
🏆 *Top məhsullar* — "Ən çox satan 10 məhsul hansıdır?"
💳 *Borclar* — "Debitor borclar nə qədərdir?"

Sadəcə sualınızı yazın! 🚀`
    );
    return res.status(200).json({ ok: true });
  }

  // "Düşünür..." göstər
  await sendTelegramMessage(chatId, "⏳ Analiz edirəm...");

  try {
    // 1. Nə lazım olduğunu müəyyən et
    const intents = await determineIntent(text);

    // 2. Paralel olaraq 1C-dən lazımi məlumatları çək
    const dataPromises = {};
    if (intents.includes("sales")) dataPromises.sales = getSalesReport();
    if (intents.includes("inventory")) dataPromises.inventory = getInventory();
    if (intents.includes("products")) dataPromises.products = getTopProducts();
    if (intents.includes("profit")) dataPromises.profit = getProfitLoss();
    if (intents.includes("receivables")) dataPromises.receivables = getReceivables();

    const businessData = {};
    for (const [key, promise] of Object.entries(dataPromises)) {
      businessData[key] = await promise;
    }

    // 3. AI cavab hazırla
    const answer = await generateAnswer(text, businessData);

    // 4. Göndər
    await sendTelegramMessage(chatId, answer);
  } catch (err) {
    console.error(err);
    await sendTelegramMessage(
      chatId,
      "❌ Xəta baş verdi. 1C serveri ilə əlaqə yoxlanılır...\n\nTəfərrüat: " + err.message
    );
  }

  return res.status(200).json({ ok: true });
}
