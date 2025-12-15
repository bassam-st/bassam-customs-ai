const ADMIN_PIN = "bassam1234";

/** ---------- تخزين محلي ---------- */
function saveLocal(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
function loadLocal(key) {
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
}

/** ---------- أدوات ---------- */
function normalize(s = "") {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPercentFromNotes(notes = "") {
  // يلتقط 5% أو 10% أو 20% أو "الفئة5%"
  const m = (notes || "").match(/(\d+(\.\d+)?)\s*%/);
  if (m) return Number(m[1]) / 100;

  const m2 = (notes || "").match(/الفئه\s*(\d+(\.\d+)?)/i) || (notes || "").match(/الفئة\s*(\d+(\.\d+)?)/i);
  if (m2) return Number(m2[1]) / 100;

  return 0;
}

function extractHSFromNotes(notes = "") {
  const m = (notes || "").match(/\b\d{8}\b/);
  return m ? m[0] : "";
}

function detectCurrency(text) {
  const t = normalize(text);
  if (t.includes("$") || t.includes("usd") || t.includes("دولار")) return "USD";
  if (t.includes("sar") || t.includes("ريال")) return "SAR";
  if (t.includes("aed") || t.includes("درهم")) return "AED";
  return "USD";
}

function extractValueMoney(text) {
  // إذا كتب قيمة بالدولار مباشرة: 300 دولار
  const t = normalize(text);
  const m = t.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** ---------- فهم الوحدة والكمية ---------- */
const UNIT_ALIASES = [
  { unit: "ton", aliases: ["طن", "ton", "tonne"] },
  { unit: "kg", aliases: ["كيلو", "kg", "كجم", "كيلوجرام"] },
  { unit: "dz", aliases: ["درزن", "dz"] },
  { unit: "pcs", aliases: ["حبه", "حبة", "قطعه", "قطعة", "pcs", "قطعه", "نفر"] },
  { unit: "W", aliases: ["w", "واط"] },
  { unit: "Ah", aliases: ["ah", "امبير", "أمبير", "امبير/ساعه", "أمبير/ساعة"] },
  { unit: "kW", aliases: ["kw", "كيلو وات", "كيلوواط"] },
  { unit: "kVA", aliases: ["kva"] },
  { unit: "ltr", aliases: ["لتر", "ltr"] },
  { unit: "yd", aliases: ["يارد", "yd"] },
  { unit: "roll", aliases: ["رول", "roll"] },
  { unit: "m2", aliases: ["م2", "m2", "متر مربع"] },
];

function detectQtyAndUnit(text) {
  const t = normalize(text);

  // يلتقط: "5 طن" أو "5kg" أو "5 درزن"
  const num = t.match(/(\d+(\.\d+)?)/);
  if (!num) return { qty: null, unit: null };

  let foundUnit = null;
  for (const u of UNIT_ALIASES) {
    for (const a of u.aliases) {
      if (t.includes(normalize(a))) {
        foundUnit = u.unit;
        break;
      }
    }
    if (foundUnit) break;
  }

  return { qty: Number(num[1]), unit: foundUnit };
}

/** ---------- قاعدة البيانات (من الاستيراد) ---------- */
// نحفظ الكتالوج هنا: catalog.items = [{name, price, unit, rate, hs, keywords[]}]
function getCatalog() {
  return loadLocal("catalog") || { items: [] };
}
function setCatalog(catalog) {
  saveLocal("catalog", catalog);
}

function buildKeywordsFromName(name = "") {
  // يبني كلمات مفتاحية بسيطة من الاسم
  const n = normalize(name)
    .replace(/[()–—\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = n.split(" ").filter(Boolean);
  // نضيف الاسم كامل + أجزاءه
  const keys = new Set([n, ...parts]);
  return Array.from(keys);
}

function findItem(query, catalog) {
  const q = normalize(query);

  // 1) تطابق مباشر بالاسم
  let best = null;
  for (const it of catalog.items) {
    const keys = (it.keywords && it.keywords.length ? it.keywords : buildKeywordsFromName(it.name)).map(normalize);
    if (keys.some(k => k && q.includes(k))) {
      best = it;
      break;
    }
  }

  // 2) إذا ما حصل، نجرب “اسم بدون إضافات”
  if (!best) {
    for (const it of catalog.items) {
      if (q.includes(normalize(it.name))) {
        best = it;
        break;
      }
    }
  }

  return best;
}

/** ---------- الحساب ---------- */
function calcFee(value, rate) {
  return value * (Number(rate) || 0);
}

/** ---------- واجهات التطبيق ---------- */
export async function answer(question) {
  const catalog = getCatalog();

  const item = findItem(question, catalog);
  const currency = detectCurrency(question);

  if (!item) {
    return { text: "لم أتعرف على الصنف. افتح ⚙️ الإدارة واستورد قائمة الأسعار أو أضف الصنف." };
  }

  // القيمة المكتوبة في السؤال (إن وجدت)
  const valueFromUser = extractValueMoney(question);

  // الكمية والوحدة (إن وجدت)
  const { qty, unit } = detectQtyAndUnit(question);

  let usedValue = null;
  let valueExplain = "";

  // 1) إذا كتب المستخدم قيمة -> نستخدمها
  if (valueFromUser != null && (normalize(question).includes("دولار") || normalize(question).includes("$") || normalize(question).includes("usd"))) {
    usedValue = valueFromUser;
    valueExplain = "استخدمت القيمة التي كتبتها أنت.";
  } else {
    // 2) إذا كتب كمية ووحدة/أو حتى كمية فقط -> نحسب من السعر الافتراضي
    if (qty != null) {
      // إذا الوحدة غير موجودة في السؤال، نستخدم وحدة الصنف المخزنة
      const u = unit || item.unit || null;
      usedValue = qty * Number(item.price || 0);
      valueExplain = `حسبت القيمة تلقائياً: الكمية (${qty} ${u || ""}) × السعر (${item.price} لكل ${item.unit || u || "وحدة"})`;
    } else {
      // 3) لا قيمة ولا كمية: نستخدم “سعر افتراضي للوحدة 1”
      usedValue = Number(item.price || 0);
      valueExplain = `لم تذكر قيمة/كمية، استخدمت سعر الصنف الافتراضي للوحدة: ${item.price} لكل ${item.unit || "وحدة"}.`;
    }
  }

  const rate = Number(item.rate || 0);
  const fee = calcFee(usedValue, rate);

  return {
    text:
`الصنف: ${item.name}
البند: ${item.hs || "غير محدد"}
الوحدة: ${item.unit || "—"}
السعر الافتراضي: ${item.price} لكل ${item.unit || "وحدة"}
الفئة/النسبة: ${(rate * 100).toFixed(2)}%

القيمة المعتمدة: ${usedValue} ${currency}
الرسوم الجمركية: ${fee.toFixed(2)} ${currency}

${valueExplain}`
  };
}

/** ---------- الإدارة ---------- */
export function adminLogin(pin) {
  return pin === ADMIN_PIN;
}

export function importPriceList(rawText) {
  // rawText = JSON array كما أرسلته
  let arr;
  try {
    arr = JSON.parse(rawText);
  } catch (e) {
    throw new Error("JSON غير صالح. تأكد أنك لصقت القائمة كاملة بين [ ]");
  }

  if (!Array.isArray(arr)) throw new Error("يجب أن يكون الاستيراد عبارة عن Array.");

  const catalog = { items: [] };

  for (const row of arr) {
    const name = row.name || "";
    const price = Number(row.price || 0);
    const unit = row.unit || "";
    const notes = row.notes || "";

    const rate = extractPercentFromNotes(notes);
    const hs = extractHSFromNotes(notes);

    catalog.items.push({
      name,
      price,
      unit,
      rate,
      hs,
      keywords: buildKeywordsFromName(name)
    });
  }

  setCatalog(catalog);
  return { count: catalog.items.length };
}

export function clearCatalog() {
  localStorage.removeItem("catalog");
}
