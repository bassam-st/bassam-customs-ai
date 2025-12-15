// engine/core.js
import { loadCatalog } from "./catalog.js";
import { buildSynonymIndexFromPrices, findCanonicalProduct, normalizeArabic } from "./synonyms.js";

function extractUSDValue(text) {
  const t = String(text || "");
  // 300 دولار / 300$ / USD 300 / 300 usd
  const m1 = t.match(/(\d+(?:\.\d+)?)\s*(?:usd|دولار|\$)\b/i);
  if (m1) return Number(m1[1]);

  const m2 = t.match(/\b(?:usd)\s*(\d+(?:\.\d+)?)/i);
  if (m2) return Number(m2[1]);

  // محاولة: آخر رقم كبير
  const m3 = t.match(/(\d{2,}(?:\.\d+)?)/);
  if (m3) return Number(m3[1]);

  return null;
}

function extractPercentFromNotes(notes) {
  const s = String(notes || "");
  // مثل: الفئة5% أو 10%
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return Number(m[1]);
}

function findPriceItemByName(prices, canonicalName) {
  if (!canonicalName) return null;
  return (prices || []).find(it => (it?.name || it?.title || it?.label) === canonicalName) || null;
}

function findHSByQuery(hsList, canonicalName) {
  // hs_catalog.json قد يكون بأشكال مختلفة، فنبحث بشكل مرن بالاسم
  const nameN = normalizeArabic(canonicalName || "");
  if (!nameN) return null;

  for (const row of (hsList || [])) {
    const n = normalizeArabic(row?.name || row?.title || row?.label || "");
    const code = row?.hs || row?.code || row?.hs_code || row?.tariff || row?.id;
    if (!code) continue;
    if (n && (n === nameN || n.includes(nameN) || nameN.includes(n))) return String(code);
  }
  return null;
}

function wantsHS(q) {
  q = normalizeArabic(q);
  return q.includes("بند") || q.includes("hs");
}
function wantsDuty(q) {
  q = normalizeArabic(q);
  return q.includes("جمارك") || q.includes("رسوم") || q.includes("كم رسوم") || q.includes("كم جمارك");
}
function wantsPrice(q) {
  q = normalizeArabic(q);
  return q.includes("قيمه") || q.includes("سعر") || q.includes("كم قيمه") || q.includes("كم سعر");
}

export async function answer(userText) {
  const { prices, hs } = await loadCatalog();
  const synIndex = buildSynonymIndexFromPrices(prices);

  const canonical = findCanonicalProduct(userText, synIndex);
  if (!canonical) {
    return {
      ok: true,
      type: "not_found",
      text: "لم أتعرف على الصنف. افتح ⚙️ الإدارة واستورد قائمة الأسعار أو اكتب اسم أو بند أقرب."
    };
  }

  const priceItem = findPriceItemByName(prices, canonical);
  const hsCode = findHSByQuery(hs, canonical);

  // لو السؤال عن البند فقط
  if (wantsHS(userText) && !wantsDuty(userText) && !wantsPrice(userText)) {
    return {
      ok: true,
      type: "hs",
      canonical,
      hs: hsCode || "غير متوفر",
      text: `الصنف: ${canonical}\nالبند: ${hsCode || "غير متوفر"}`
    };
  }

  // لو السؤال عن القيمة/السعر
  if (wantsPrice(userText) && !wantsDuty(userText)) {
    const p = priceItem?.price;
    const unit = priceItem?.unit || "";
    const notes = priceItem?.notes || "";
    return {
      ok: true,
      type: "price",
      canonical,
      hs: hsCode || "",
      price: (p ?? null),
      unit,
      notes,
      text: `الصنف: ${canonical}\nالبند: ${hsCode || "غير متوفر"}\nالقيمة: ${p ?? "غير متوفر"} ${unit}\nملاحظات: ${notes || "-"}`
    };
  }

  // لو السؤال عن الرسوم/الجمارك
  if (wantsDuty(userText)) {
    const percent = extractPercentFromNotes(priceItem?.notes || "");
    const usd = extractUSDValue(userText);

    if (!percent && usd == null) {
      return {
        ok: true,
        type: "need_value_and_rate",
        canonical,
        hs: hsCode || "",
        text: `وجدت الصنف: ${canonical}\nالبند: ${hsCode || "غير متوفر"}\nأرسل القيمة بالدولار (مثال: "${canonical} 300 دولار")`
      };
    }

    if (usd == null) {
      return {
        ok: true,
        type: "need_value",
        canonical,
        hs: hsCode || "",
        text: `الصنف: ${canonical}\nالبند: ${hsCode || "غير متوفر"}\nأحتاج قيمة البضاعة بالدولار للحساب.\nمثال: "${canonical} 300 دولار"`
      };
    }

    if (!percent) {
      return {
        ok: true,
        type: "need_rate",
        canonical,
        hs: hsCode || "",
        value_usd: usd,
        text: `الصنف: ${canonical}\nالقيمة: USD ${usd}\nلا أجد نسبة الفئة في الملاحظات لهذا الصنف داخل الأسعار.\nضعها داخل ملاحظات الصنف مثل: "الفئة5%" أو "10%".`
      };
    }

    const duty = (usd * (percent / 100));
    return {
      ok: true,
      type: "duty",
      canonical,
      hs: hsCode || "",
      value_usd: usd,
      percent,
      duty_usd: duty,
      text:
        `الصنف: ${canonical}\n` +
        `البند: ${hsCode || "غير متوفر"}\n` +
        `القيمة: USD ${usd}\n` +
        `النسبة: ${percent}%\n` +
        `الرسوم الجمركية: USD ${duty}\n` +
        `الرسوم = القيمة × النسبة`
    };
  }

  // رد عام (يعرض كل شيء)
  return {
    ok: true,
    type: "info",
    canonical,
    hs: hsCode || "",
    text:
      `الصنف: ${canonical}\n` +
      `البند: ${hsCode || "غير متوفر"}\n` +
      `ملاحظات: ${(priceItem?.notes || "-")}`
  };
}
