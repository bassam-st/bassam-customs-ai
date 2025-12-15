async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("فشل تحميل: " + path);
  return await r.json();
}

function normalize(s="") {
  return (s || "").toString().trim().toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function extractNumber(text) {
  const m = (text || "").match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function detectCurrency(text, synonyms) {
  const t = normalize(text);
  for (const [cur, arr] of Object.entries(synonyms.currency || {})) {
    for (const k of arr) {
      if (t.includes(normalize(k))) return cur;
    }
  }
  return null;
}

function findHS(query, hsdb) {
  const q = normalize(query);
  const hsDirect = (query || "").match(/\b\d{8}\b/);
  if (hsDirect) return { hs: hsDirect[0], confidence: 0.99 };

  let best = null;
  for (const it of (hsdb.items || [])) {
    const keys = [it.name, ...(it.keywords || [])].map(normalize);
    const hit = keys.some(k => k && q.includes(k));
    if (hit) {
      best = { hs: it.hs, name: it.name, confidence: 0.85 };
      break;
    }
  }
  return best;
}

function getRule(hs, rulesDB) {
  return (rulesDB.rules || []).find(r => r.hs === hs) || null;
}

function calculate(rule, value) {
  if (!rule) return { ok:false, error:"لا توجد قاعدة لهذا البند بعد." };
  if (value == null || isNaN(value)) return { ok:false, error:"أحتاج قيمة البضاعة للحساب." };

  if (rule.type === "percent_of_value") {
    const fee = value * Number(rule.rate || 0);
    return { ok:true, fee, details:`الرسوم = القيمة × النسبة (${rule.rate})` };
  }
  return { ok:false, error:"نوع حساب غير مدعوم." };
}

export async function answer(question) {
  const [hsdb, rulesDB, syn] = await Promise.all([
    loadJSON("./brain/hs_codes.json"),
    loadJSON("./brain/customs_rules.json"),
    loadJSON("./brain/synonyms.json")
  ]);

  const hsHit = findHS(question, hsdb);
  const currency = detectCurrency(question, syn) || rulesDB.currency_default;
  const value = extractNumber(question);

  if (!hsHit) {
    return {
      ok: true,
      text: "لم أتعرف على الصنف. اكتب اسم السلعة أو بند HS."
    };
  }

  const rule = getRule(hsHit.hs, rulesDB);
  const res = calculate(rule, value);

  if (!res.ok) {
    return { ok:true, text: `${res.error}` };
  }

  return {
    ok: true,
    text:
`الصنف: ${hsHit.name}
البند: ${hsHit.hs}
القيمة: ${value} ${currency}

الرسوم الجمركية: ${res.fee} ${currency}
${res.details}`
  };
}
