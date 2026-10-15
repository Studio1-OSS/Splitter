// Generates the benchmark set: 150 synthetic bills, 30 in each of five categories that match how Splitter is
// used (groceries, party, home & rent, food, travel), plus cases.json with the full ground truth.
//
// Deterministic: a fixed seed, and every axis is assigned in rotation, so each category gets the same mix of
// currencies, layouts, photo conditions and planted errors. Images are rendered with Chrome (playwright-core).
//
//   pnpm bench:dataset
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const PER_CATEGORY = 30;
const CURRENCIES = ["INR", "USD", "EUR"]; // 10 each per category
const CONDITIONS = ["clean", "clean", "faded", "rotated", "long"]; // 12 clean, 6 faded, 6 rotated, 6 long
// 6 planted wrong totals per category (20%), at positions chosen so they're balanced on every other axis:
// 2 per currency; 2 clean, 2 faded, 1 rotated, 1 long; all three layouts; different group sizes; spread over the set.
const PLANTED = new Set([0, 4, 10, 17, 23, 27]);
const isPlanted = (i) => PLANTED.has(i);
const PEOPLE = ["Aman", "Priya", "Rakesh", "Mahima", "Sam"];

let seed = 20261015;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const pick = (a) => a[Math.floor(rand() * a.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const shuffle = (a) => a.map((v) => [rand(), v]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

const SYMBOL = { INR: "₹", USD: "$", EUR: "€" };
// Typical prices are given in USD and scaled; INR prices are whole rupees.
const FX = { INR: 83, USD: 1, EUR: 0.92 };
const round = (n, cur) => (cur === "INR" ? Math.round(n) : Math.round(n * 100) / 100);
const fmt = (n, cur) => (cur === "INR" ? n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toFixed(2));
const TAX = { INR: [0.05, "GST 5%"], USD: [0.08875, "Sales tax 8.875%"], EUR: [0.1, "VAT 10%"] };

// Each category: merchants, the documents they issue, priced items (USD), and which charges apply.
const CATEGORIES = {
  groceries: {
    merchants: ["GreenLeaf Supermarket", "Daily Fresh Mart", "Corner Pantry", "Harvest Grocers", "Urban Basket"],
    layouts: ["thermal", "thermal", "invoice"],
    items: [["Whole milk 1L", 1.2], ["Free-range eggs x12", 3.4], ["Sourdough loaf", 4.1], ["Basmati rice 5kg", 9.5], ["Bananas 1kg", 1.6], ["Greek yoghurt", 2.8], ["Olive oil 1L", 8.9], ["Coffee beans 500g", 7.5], ["Dish soap", 2.3], ["Laundry detergent", 11.2], ["Chicken breast 1kg", 8.4], ["Tomatoes 1kg", 2.6], ["Cheddar 400g", 5.3], ["Pasta 500g", 1.9], ["Paper towels x6", 6.1], ["Orange juice 1L", 3.2]],
    charges: { tax: 1, discount: 0.4, service: 0, tip: 0 },
    shared: 0.6,
  },
  party: {
    merchants: ["Confetti Party Store", "The Cake Studio", "Bottle & Barrel", "Night Owl Events", "Balloon Bazaar"],
    layouts: ["thermal", "invoice", "invoice"],
    items: [["Birthday cake 2kg", 38], ["Helium balloons x30", 24], ["Banner 'Happy 30th'", 9], ["Paper plates x50", 6], ["Sparkling wine x2", 32], ["Craft beer case", 28], ["Snack platter", 45], ["Fairy lights", 14], ["DJ booking 3h", 180], ["Venue hire", 250], ["Party poppers x20", 8], ["Ice 10kg", 7], ["Soft drinks x12", 11], ["Candles & holders", 12]],
    charges: { tax: 1, discount: 0.2, service: 0.3, tip: 0 },
    shared: 0.75,
  },
  home: {
    merchants: ["Lakeview Apartments", "CityPower Electricity", "AquaFlow Water", "FibreNet Broadband", "Maple Court Society"],
    // Items that make sense for each merchant (a landlord, a utility, a society), used instead of the shared pool.
    byMerchant: {
      "Lakeview Apartments": [["Monthly rent", 900], ["Parking bay", 40], ["Housekeeping", 55], ["Late payment fee", 10], ["Security deposit top-up", 120], ["Furniture rental", 45]],
      "CityPower Electricity": [["Electricity 240 kWh", 38], ["Fixed charge", 6], ["Meter rent", 2], ["Fuel adjustment", 4], ["Previous dues", 22]],
      "AquaFlow Water": [["Water usage 18 kL", 22], ["Sewage charge", 9], ["Fixed charge", 5], ["Tanker delivery", 18]],
      "FibreNet Broadband": [["Broadband 300 Mbps", 35], ["Streaming bundle", 18], ["Router rental", 4], ["Static IP", 6], ["Installation", 20]],
      "Maple Court Society": [["Maintenance charge", 60], ["Cooking gas refill", 14], ["Pest control visit", 25], ["Clubhouse fee", 15], ["Lift maintenance", 12], ["Garden upkeep", 9]],
    },
    layouts: ["invoice", "invoice", "app"],
    items: [["Monthly rent", 900], ["Maintenance charge", 60], ["Electricity 240 kWh", 38], ["Water & sewage", 22], ["Broadband 300 Mbps", 35], ["Cooking gas refill", 14], ["Parking bay", 40], ["Housekeeping", 55], ["Late payment fee", 10], ["Security deposit top-up", 120], ["Streaming bundle", 18], ["Pest control visit", 25]],
    charges: { tax: 0.6, discount: 0.15, service: 0.2, tip: 0 },
    shared: 0.8,
  },
  food: {
    merchants: ["Britto's Beach Shack", "Trattoria Roma", "Spice Route Kitchen", "Sakura Sushi Bar", "Third Wave Coffee"],
    layouts: ["thermal", "thermal", "app"],
    items: [["Margherita pizza", 12], ["Prawn curry", 14], ["Carbonara", 15], ["Salmon roll", 9], ["Paneer tikka", 8], ["Caesar salad", 11], ["Fish thali", 10], ["Cappuccino", 3.5], ["Iced latte", 4.5], ["Tiramisu", 7], ["Garlic naan", 2.5], ["Lime soda", 2], ["House red 0.5L", 13], ["Mango lassi", 3.5], ["Club sandwich", 10], ["Gulab jamun", 4]],
    charges: { tax: 1, discount: 0.2, service: 0.35, tip: 0.5 },
    shared: 0.5,
  },
  travel: {
    merchants: ["Casa Anjuna Resort", "Goa Cabs", "SkyLine Airways", "RailConnect", "MetroRide", "Harbour View Hotel"],
    byMerchant: {
      "Casa Anjuna Resort": [["Deluxe room x2 nights", 190], ["Breakfast buffet x4", 48], ["Airport transfer", 35], ["Late checkout", 30], ["Spa session", 45], ["Minibar", 22], ["City tax", 9]],
      "Harbour View Hotel": [["Sea-view room x3 nights", 270], ["Room service", 38], ["Laundry", 16], ["Scooter rental 2 days", 26], ["Ferry tickets x4", 20], ["City tax", 9]],
      "Goa Cabs": [["Base fare", 14], ["Distance 18 km", 11], ["Waiting time", 3], ["Toll & parking", 4], ["Night surcharge", 5]],
      "MetroRide": [["Base fare", 6], ["Distance 9 km", 7], ["Booking fee", 1.5], ["Toll", 2], ["Airport pickup", 6]],
      "SkyLine Airways": [["Economy fare x2", 260], ["Checked bag 23kg", 40], ["Seat selection", 18], ["Meal pre-order", 12], ["Airport fees", 35]],
      "RailConnect": [["Sleeper berth x3", 72], ["Chair car x2", 30], ["Reservation fee", 3], ["Catering", 9], ["Travel insurance", 2]],
    },
    layouts: ["invoice", "app", "app"],
    items: [["Deluxe room x2 nights", 190], ["Breakfast buffet x4", 48], ["Airport transfer", 35], ["Base fare", 14], ["Distance 18 km", 11], ["Toll & parking", 4], ["Economy fare x2", 260], ["Checked bag 23kg", 40], ["Seat selection", 18], ["Sleeper berth x3", 72], ["City tax", 9], ["Late checkout", 30], ["Scooter rental 2 days", 26], ["Ferry tickets x4", 20]],
    charges: { tax: 1, discount: 0.25, service: 0.15, tip: 0.15 },
    shared: 0.7,
  },
};

function makeCase(category, i) {
  const spec = CATEGORIES[category];
  const currency = CURRENCIES[i % 3];
  const condition = CONDITIONS[i % CONDITIONS.length];
  const layout = spec.layouts[Math.floor(i / 3) % spec.layouts.length];
  const planted = isPlanted(i);
  const merchant = spec.merchants[i % spec.merchants.length];
  const people = PEOPLE.slice(0, 2 + (i % 4)); // 2–5 people, in rotation
  const lineCount = condition === "long" ? between(9, 12) : between(3, 6);

  // Long statements repeat a merchant's items by date, like a multi-day hotel folio or a monthly cab statement.
  const base = spec.byMerchant?.[merchant] ?? spec.items;
  const days = ["11 Oct", "12 Oct", "13 Oct", "14 Oct"];
  const pool = base.length >= lineCount ? base : days.flatMap((d) => base.map(([name, usd]) => [`${name} · ${d}`, usd]));
  const items = shuffle(pool)
    .slice(0, lineCount)
    .map(([name, usd]) => {
      const quantity = usd > 50 ? 1 : between(1, 3);
      const unit = round(usd * FX[currency] * (0.85 + rand() * 0.3), currency);
      return { name, quantity, totalPrice: round(unit * quantity, currency) };
    });

  // Who had what: shared by everyone, a pair, or one person. Home bills are mostly shared.
  const assignment = items.map(() => {
    const r = rand();
    if (r < spec.shared) return [...people];
    if (r < spec.shared + (1 - spec.shared) / 2 && people.length > 2) {
      const a = pick(people);
      return [a, pick(people.filter((p) => p !== a))];
    }
    return [pick(people)];
  });

  const subtotal = round(items.reduce((a, it) => a + it.totalPrice, 0), currency);
  const [rate, taxLabel] = TAX[currency];
  const tax = rand() < spec.charges.tax ? round(subtotal * rate, currency) : null;
  const serviceCharge = rand() < spec.charges.service ? round(subtotal * 0.1, currency) : null;
  const tip = rand() < spec.charges.tip ? round(subtotal * (currency === "USD" ? 0.18 : 0.1), currency) : null;
  const discount = rand() < spec.charges.discount ? round(subtotal * 0.1, currency) : null;
  const correctTotal = round(subtotal + (tax ?? 0) + (serviceCharge ?? 0) + (tip ?? 0) - (discount ?? 0), currency);
  // A planted error is a believable mistake: the printed total is off by a round amount.
  const off = currency === "INR" ? pick([100, 50, 200]) : pick([10, 5, 20]);
  const total = planted ? round(correctTotal + off, currency) : correctTotal;

  const note = items
    .map((it, n) => {
      const who = assignment[n];
      if (who.length === people.length) return `everyone shared the ${it.name}`;
      if (who.length === 2) return `${who[0]} and ${who[1]} shared the ${it.name}`;
      return `${who[0]} had the ${it.name}`;
    })
    .join(", ");

  const id = `${category}-${String(i + 1).padStart(2, "0")}`;
  return {
    id,
    file: `${id}.png`,
    category,
    layout,
    condition,
    currency,
    people,
    note: note[0].toUpperCase() + note.slice(1) + ".",
    planted,
    truth: { merchant, currency, items, subtotal, tax, taxLabel, serviceCharge, tip, discount, total, correctTotal, assignment, date: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}` },
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────
function chargeRows(t, row) {
  return [
    row("Subtotal", fmt(t.subtotal, t.currency)),
    t.tax != null ? row(t.taxLabel, fmt(t.tax, t.currency)) : "",
    t.serviceCharge != null ? row("Service charge 10%", fmt(t.serviceCharge, t.currency)) : "",
    t.tip != null ? row("Tip", fmt(t.tip, t.currency)) : "",
    t.discount != null ? row("Discount 10%", `-${fmt(t.discount, t.currency)}`) : "",
  ].join("");
}

function filterFor(c) {
  if (c.condition === "faded") return "filter:contrast(.55) brightness(1.12) blur(.45px);";
  return "";
}
const tilt = (c) => (c.condition === "rotated" ? "transform:rotate(-4deg);" : "transform:rotate(-.5deg);");

function thermal(c) {
  const t = c.truth;
  const row = (l, r, cls = "") => `<div class="row ${cls}"><span>${l}</span><span>${r}</span></div>`;
  return `<style>body{margin:0;background:#e6e2da;display:flex;justify-content:center;padding:36px;font-family:"Courier New",monospace}
  .r{width:340px;background:#fff;padding:22px 20px 30px;box-shadow:0 2px 6px #0002;color:#222;${tilt(c)}${filterFor(c)}}
  h1{font-size:19px;text-align:center;margin:0 0 4px}.c{text-align:center;font-size:12px}
  .row{display:flex;justify-content:space-between;gap:12px;font-size:14px;margin:4px 0}.hr{border-top:1px dashed #555;margin:10px 0}.b{font-weight:bold;font-size:16px}</style>
  <div class="r"><h1>${t.merchant.toUpperCase()}</h1><div class="c">Receipt ${c.id.toUpperCase()} · ${t.date.split("-").reverse().join("/")} 19:${String(10 + (c.id.length % 40)).padStart(2, "0")}</div><div class="hr"></div>
  ${t.items.map((it) => row(`${it.quantity} x ${it.name}`, fmt(it.totalPrice, t.currency))).join("")}<div class="hr"></div>${chargeRows(t, row)}<div class="hr"></div>${row(`TOTAL ${SYMBOL[t.currency]}`, fmt(t.total, t.currency), "b")}
  <div class="c" style="margin-top:12px">Thank you!</div></div>`;
}

function invoice(c) {
  const t = c.truth;
  const row = (l, r) => `<tr class="sum"><td colspan="3">${l}</td><td>${r}</td></tr>`;
  return `<style>body{margin:0;background:#d9dde3;display:flex;justify-content:center;align-items:flex-start;padding:30px;font-family:Helvetica,Arial,sans-serif}
  .p{width:560px;background:#fff;padding:34px 36px;color:#1d2433;box-shadow:0 3px 10px #0002;${tilt(c)}${filterFor(c)}}
  .h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1d2433;padding-bottom:12px}
  h1{margin:0;font-size:22px}.m{font-size:12px;color:#556}.inv{text-align:right;font-size:12px}.inv b{font-size:18px;display:block}
  table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}th{text-align:left;border-bottom:1px solid #99a;padding:6px 4px}td{padding:6px 4px;border-bottom:1px solid #eef}
  td:last-child,th:last-child{text-align:right}.sum td{border:0;padding:3px 4px}.grand td{font-weight:bold;font-size:15px;border-top:2px solid #1d2433;padding-top:8px}</style>
  <div class="p"><div class="h"><div><h1>${t.merchant}</h1><div class="m">${c.category === "home" ? "Statement for your flat" : "Tax invoice"} · ${t.currency}</div></div><div class="inv"><b>INVOICE</b>No. ${c.id.toUpperCase()}<br>Date ${t.date}</div></div>
  <table><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr>
  ${t.items.map((it) => `<tr><td>${it.name}</td><td>${it.quantity}</td><td>${fmt(round(it.totalPrice / it.quantity, t.currency), t.currency)}</td><td>${fmt(it.totalPrice, t.currency)}</td></tr>`).join("")}
  ${chargeRows(t, row)}<tr class="sum grand"><td colspan="3">Amount due (${t.currency})</td><td>${SYMBOL[t.currency]}${fmt(t.total, t.currency)}</td></tr></table>
  <div class="m" style="margin-top:22px">Please pay within 7 days. Questions? Reply to this invoice.</div></div>`;
}

function app(c) {
  const t = c.truth;
  const row = (l, r) => `<div class="row"><span>${l}</span><span>${r}</span></div>`;
  return `<style>body{margin:0;font-family:-apple-system,Helvetica,Arial;background:#f2f2f4;width:390px}
  .wrap{${filterFor(c)}${c.condition === "rotated" ? "transform:rotate(-3deg);transform-origin:center top;" : ""}}
  .top{background:#111;color:#fff;padding:44px 20px 18px}.top p{margin:0;opacity:.7;font-size:13px}.top h2{margin:6px 0 0;font-size:21px}
  .card{background:#fff;margin:14px;border-radius:14px;padding:16px}.amt{font-size:34px;font-weight:700;margin:4px 0 10px}
  .row{display:flex;justify-content:space-between;gap:12px;font-size:14px;color:#333;margin:9px 0}.hr{border-top:1px solid #eee;margin:10px 0}.ok{color:#0a7a3e;font-weight:600}</style>
  <div class="wrap"><div class="top"><p>${c.category === "home" ? "Bill" : "Receipt"} · ${t.date}</p><h2>${t.merchant}</h2></div>
  <div class="card"><div class="amt">${SYMBOL[t.currency]}${fmt(t.total, t.currency)}</div><div class="row"><span>Ref ${c.id.toUpperCase()}</span><span class="ok">● Paid</span></div></div>
  <div class="card">${t.items.map((it) => row(`${it.quantity > 1 ? `${it.quantity} × ` : ""}${it.name}`, fmt(it.totalPrice, t.currency))).join("")}<div class="hr"></div>${chargeRows(t, row)}<div class="hr"></div>${row("<b>Total</b>", `<b>${fmt(t.total, t.currency)}</b>`)}</div></div>`;
}

const RENDER = { thermal, invoice, app };

const cases = Object.keys(CATEGORIES).flatMap((category) => Array.from({ length: PER_CATEGORY }, (_, i) => makeCase(category, i)));
const browser = await chromium.launch({ channel: "chrome" });
for (const old of fs.readdirSync(OUT).filter((f) => f.endsWith(".png"))) fs.unlinkSync(path.join(OUT, old));
for (const c of cases) {
  // A fresh page per bill, sized for its layout, and a screenshot of the document itself: resizing one page
  // between layouts and taking full-page shots produced tiled, broken images.
  const page = await browser.newPage({ viewport: { width: c.layout === "app" ? 430 : 680, height: 1600 }, deviceScaleFactor: 1.5 });
  await page.setContent(`<div id="doc" style="display:inline-block;align-self:flex-start;padding:28px">${RENDER[c.layout](c)}</div>`, { waitUntil: "load" });
  await page.locator("#doc").screenshot({ path: path.join(OUT, c.file) });
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, "cases.json"), JSON.stringify(cases, null, 2));

const count = (f) => cases.filter(f).length;
console.log(`Wrote ${cases.length} bills to ${OUT}`);
for (const cat of Object.keys(CATEGORIES)) {
  const cs = cases.filter((c) => c.category === cat);
  console.log(`  ${cat.padEnd(10)} ${cs.length} bills · planted ${cs.filter((c) => c.planted).length} · ${CURRENCIES.map((cur) => `${cur} ${cs.filter((c) => c.currency === cur).length}`).join(" ")} · layouts ${["thermal", "invoice", "app"].map((l) => `${l} ${cs.filter((c) => c.layout === l).length}`).join(" ")}`);
}
console.log(`  conditions: ${["clean", "faded", "rotated", "long"].map((k) => `${k} ${count((c) => c.condition === k)}`).join(" · ")}`);
