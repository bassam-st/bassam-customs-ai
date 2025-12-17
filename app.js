// app.js
import { answerUserQuestion } from "./engine/logic.js";

const $q = document.getElementById("q");
const $btn = document.getElementById("ask");
const $out = document.getElementById("out");

function render(res) {
  if (!res.ok) {
    $out.textContent = res.message;
    return;
  }
  const lines = [
    `الصنف: ${res.name}`,
    res.hs ? `البند: ${res.hs}` : `البند: غير متوفر`,
    res.value != null ? `القيمة: USD ${res.value}` : (res.defaultPrice != null ? `سعر افتراضي: ${res.defaultPrice} / ${res.unit || ""}` : ""),
    res.notes ? `ملاحظات: ${res.notes}` : ""
  ].filter(Boolean);

  $out.textContent = lines.join("\n");
}

$btn.addEventListener("click", async () => {
  $out.textContent = "جاري التحميل...";
  try {
    const res = await answerUserQuestion($q.value);
    render(res);
  } catch (e) {
    $out.textContent = "حصل خطأ: " + (e?.message || e);
  }
});
