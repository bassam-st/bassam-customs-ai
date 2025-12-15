const ADMIN_PIN = "bassam1234";

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("فشل تحميل: " + path);
  return await r.json();
}

function saveLocal(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function loadLocal(key) {
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
}

function normalize(s="") {
  return s.toString().toLowerCase()
    .replace(/[إأآ]/g,"ا")
    .replace(/ة/g,"ه")
    .replace(/ى/g,"ي")
    .trim();
}

function extractNumber(text) {
  const m = text.match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function detectCurrency(text) {
  if (text.includes("دولار") || text.includes("$")) return "USD";
  if (text.includes("ريال")) return "SAR";
  return "USD";
}

function findHS(query, db) {
  const q = normalize(query);
  for (const it of db.items) {
    const keys = [it.name, ...(it.keywords||[])].map(normalize);
    if (keys.some(k => q.includes(k))) return it;
  }
  return null;
}

export async function answer(question) {
  let hsdb = loadLocal("hsdb") || await loadJSON("./brain/hs_codes.json");
  let rules = loadLocal("rules") || await loadJSON("./brain/customs_rules.json");

  const hit = findHS(question, hsdb);
  const value = extractNumber(question);
  const currency = detectCurrency(question);

  if (!hit) {
    return { text: "لم أتعرف على الصنف. يمكنك إضافته من ⚙️ الإدارة." };
  }

  if (!value) {
    return { text: "أحتاج قيمة البضاعة للحساب." };
  }

  const rule = rules.rules.find(r => r.hs === hit.hs);
  const rate = rule ? Number(rule.rate) : 0;
  const fee = value * rate;

  return {
    text:
`الصنف: ${hit.name}
البند: ${hit.hs}
القيمة: ${value} ${currency}

الرسوم الجمركية: ${fee} ${currency}
الرسوم = القيمة × النسبة (${rate})`
  };
}

export function adminLogin(pin) {
  return pin === ADMIN_PIN;
}

export function addItem(item) {
  let hsdb = loadLocal("hsdb");
  if (!hsdb) hsdb = { items: [] };
  hsdb.items.push(item);
  saveLocal("hsdb", hsdb);
}

export function addRule(rule) {
  let rules = loadLocal("rules");
  if (!rules) rules = { rules: [] };
  rules.rules.push(rule);
  saveLocal("rules", rules);
}
