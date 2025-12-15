// engine/synonyms.js
// يبني مرادفات تلقائياً لكل أصناف prices_catalog.json
// + قاموس صغير لمرادفات شائعة (تقدر تزيد عليه لاحقاً)

export const EXTRA_SYNONYMS = {
  // اكتب مفاتيح عامة أو اسم صنف كامل (الآن يدعم الاثنين)
  "مودم": ["مودم", "مودمات", "مودم نت", "مودم انترنت", "موديم", "موديمات", "راوتر", "راوترات"],
  "صحون": ["صحون نت", "صحن نت", "صحون الانترنت", "صحن انترنت", "انتينا نت", "طبق نت", "طبق انترنت"],
  "اسلاك كاميرا": ["سلك كاميرا", "اسلاك كاميرا", "كيبل كاميرا", "كابل كاميرا", "سلك 305", "305 متر سلك"],
  "ملابس": ["ملابس", "لبس", "ألبسة", "ملابس درزن", "قيمة الدرزن ملابس", "درزن ملابس"],
};

// ------------------ أدوات تطبيع نص عربي ------------------
function stripDiacritics(s) {
  return (s || "").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
}
export function normalizeArabic(s) {
  s = stripDiacritics(String(s || ""));
  s = s
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return s;
}
function simplifyName(name) {
  return String(name || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(s) {
  return normalizeArabic(s).split(" ").filter(Boolean);
}
function addVariant(set, v) {
  const n = normalizeArabic(v);
  if (n && n.length >= 2) set.add(n);
}
function pluralVariants(word) {
  const out = new Set([word]);
  if (word.endsWith("ات")) out.add(word.slice(0, -2));
  if (!word.endsWith("ات") && word.length >= 3) out.add(word + "ات");
  return [...out];
}

// ------------------ بناء فهرس المرادفات ------------------
export function buildSynonymIndexFromPrices(pricesList) {
  const bySyn = new Map();
  const canonicalSet = new Set();

  function bind(syn, canonical) {
    const k = normalizeArabic(syn);
    if (!k) return;
    if (!bySyn.has(k)) bySyn.set(k, canonical);
  }

  // أولاً: اربط مرادفات كل صنف من اسمه
  for (const item of (pricesList || [])) {
    const canonical = item?.name || item?.title || item?.label;
    if (!canonical) continue;

    canonicalSet.add(canonical);

    const base = simplifyName(canonical);
    const tks = tokens(base);

    const syns = new Set();
    addVariant(syns, canonical);
    addVariant(syns, base);

    for (const tk of tks) {
      for (const pv of pluralVariants(tk)) addVariant(syns, pv);
    }

    if (tks.length >= 2) addVariant(syns, tks.slice(0, 2).join(" "));
    if (tks.length >= 3) addVariant(syns, tks.slice(0, 3).join(" "));

    const dropUnits = tks.filter(w => ![
      "للدرزن","للطن","للكيلو","للحبه","بوصه","متر","kg","ton","pcs","dz","yd","w","ah","ltr","m2"
    ].includes(w));
    if (dropUnits.length) addVariant(syns, dropUnits.join(" "));

    for (const s of syns) bind(s, canonical);
  }

  // ثانياً: طبّق EXTRA_SYNONYMS بطريقة ذكية:
  // - إذا المفتاح يطابق اسم صنف كامل → يربطه مباشرة
  // - إذا المفتاح كلمة عامة (مثل مودم) → يربطه لأقرب صنف يحتويها
  const canonicals = [...canonicalSet];
  for (const key of Object.keys(EXTRA_SYNONYMS)) {
    const list = EXTRA_SYNONYMS[key] || [];
    if (!list.length) continue;

    const keyN = normalizeArabic(key);

    // 1) تطابق كامل لاسم صنف
    let target = canonicals.find(c => normalizeArabic(c) === keyN);

    // 2) إذا ما فيش: أقرب صنف يحتوي الكلمة
    if (!target) {
      target = canonicals.find(c => normalizeArabic(c).includes(keyN));
    }

    // 3) اربط المرادفات
    if (target) {
      for (const syn of list) bind(syn, target);
    }
  }

  return { bySyn, canonicalSet };
}

// ------------------ إيجاد أفضل صنف من سؤال المستخدم ------------------
export function findCanonicalProduct(userText, synonymIndex) {
  const { bySyn } = synonymIndex;
  const text = normalizeArabic(userText);

  if (bySyn.has(text)) return bySyn.get(text);

  let best = null;
  let bestLen = 0;

  for (const [syn, canonical] of bySyn.entries()) {
    if (syn.length < 3) continue;
    if (text.includes(syn) && syn.length > bestLen) {
      best = canonical;
      bestLen = syn.length;
    }
  }
  return best;
}
