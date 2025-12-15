const PRICES_URL = "https://cdn.jsdelivr.net/gh/bassam-st/bassam-customs-calculator@main/assets/prices_catalog.json";
const HS_URL     = "https://cdn.jsdelivr.net/gh/bassam-st/bassam-customs-calculator@main/assets/hs_catalog.json";

let CATALOG = { prices: null, hs: null };

export async function loadCatalog() {
  if (CATALOG.prices && CATALOG.hs) return CATALOG;

  const [p, h] = await Promise.all([fetch(PRICES_URL), fetch(HS_URL)]);
  if (!p.ok) throw new Error("فشل تحميل prices_catalog.json");
  if (!h.ok) throw new Error("فشل تحميل hs_catalog.json");

  CATALOG.prices = await p.json();
  CATALOG.hs = await h.json();
  return CATALOG;
}
