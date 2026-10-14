// Generates the sample bills in this folder from HTML, so they're free to use and redistribute.
// Requires Google Chrome and playwright-core:  pnpm add -D playwright-core && node evals/fixtures/generate.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] ?? path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });

const receiptCss = `body{margin:0;background:#e9e6df;display:flex;justify-content:center;align-items:flex-start;padding:30px;font-family:"Courier New",monospace}
.r{width:340px;background:#fff;padding:22px 20px 30px;box-shadow:0 2px 6px #0002;color:#222;transform:rotate(-1deg)}
h1{font-size:20px;text-align:center;margin:0 0 4px}.c{text-align:center;font-size:12px}
.row{display:flex;justify-content:space-between;font-size:14px;margin:4px 0}.hr{border-top:1px dashed #555;margin:10px 0}.b{font-weight:bold;font-size:16px}`;

const shots = [
  {
    name: "receipt-beach-shack",
    w: 420,
    html: `<style>${receiptCss}</style><div class="r"><h1>BRITTO'S BEACH SHACK</h1><div class="c">Baga Beach, Goa 403516<br>GSTIN 30ABCDE1234F1Z5</div><div class="c">Date: 10/10/2026 &nbsp; Time: 21:42<br>Table 7 · Covers 4</div><div class="hr"></div>
    <div class="row"><span>2 x Prawn Curry</span><span>1,400.00</span></div><div class="row"><span>4 x Kingfisher 650ml</span><span>1,200.00</span></div><div class="row"><span>1 x Fish Thali</span><span>480.00</span></div><div class="row"><span>2 x Fresh Lime Soda</span><span>160.00</span></div><div class="hr"></div>
    <div class="row"><span>Sub Total</span><span>3,240.00</span></div><div class="row"><span>CGST 2.5%</span><span>81.00</span></div><div class="row"><span>SGST 2.5%</span><span>81.00</span></div><div class="hr"></div><div class="row b"><span>TOTAL INR</span><span>3,402.00</span></div><div class="c" style="margin-top:12px">Paid by Card ****4521<br>Thank you! Visit again</div></div>`,
  },
  {
    name: "receipt-party-decor",
    w: 420,
    html: `<style>${receiptCss}</style><div class="r"><h1>PARTY MART</h1><div class="c">Indiranagar, Bengaluru<br>12/10/2026 18:05</div><div class="hr"></div>
    <div class="row"><span>Balloons (pack of 50)</span><span>450.00</span></div><div class="row"><span>"Happy 30th" banner</span><span>350.00</span></div><div class="row"><span>Candles x 2</span><span>150.00</span></div><div class="row"><span>Paper plates</span><span>300.00</span></div><div class="hr"></div><div class="row b"><span>TOTAL ₹</span><span>1,250.00</span></div><div class="c" style="margin-top:12px">UPI · Mahima S</div></div>`,
  },
  ...[["taxi-1", "Calangute", "09 Oct 2026, 2:10 PM", "200"], ["taxi-2", "Back to hotel", "11 Oct 2026, 11:48 PM", "200"]].map(([name, dest, when, amt]) => ({
    name,
    w: 390,
    h: 760,
    html: `<style>body{margin:0;font-family:-apple-system,Helvetica,Arial;background:#f4f4f4}.top{background:#111;color:#fff;padding:48px 20px 20px}.top p{margin:0;opacity:.7;font-size:13px}.top h2{margin:6px 0 0;font-size:22px}.card{background:#fff;margin:16px;border-radius:14px;padding:18px}.amt{font-size:40px;font-weight:700;margin:6px 0}.row{display:flex;justify-content:space-between;font-size:14px;color:#444;margin:10px 0}.ok{color:#0a7a3e;font-weight:600}</style>
    <div class="top"><p>Ride receipt</p><h2>Goa Cabs</h2></div><div class="card"><div class="row"><span>Trip to</span><span><b>${dest}</b></span></div><div class="amt">₹${amt}</div><div class="row"><span>${when}</span><span class="ok">● Paid</span></div><div class="row"><span>Base fare</span><span>₹170</span></div><div class="row"><span>Taxes</span><span>₹30</span></div><div class="row"><span>Paid with</span><span>Cash · Rakesh</span></div></div>`,
  })),
  {
    name: "upi-payment",
    w: 390,
    h: 760,
    html: `<style>body{margin:0;font-family:-apple-system,Helvetica,Arial;background:#fff;text-align:center}.tick{width:84px;height:84px;border-radius:50%;background:#1aa260;color:#fff;font-size:52px;line-height:84px;margin:70px auto 18px}.amt{font-size:42px;font-weight:700}.sub{color:#555;margin:6px 0}.box{margin:28px 22px;text-align:left;border:1px solid #e3e3e3;border-radius:12px;padding:14px;font-size:14px;color:#333}.box div{display:flex;justify-content:space-between;margin:8px 0}</style>
    <div class="tick">✓</div><div class="amt">₹300</div><div class="sub">Paid to <b>Aman Verma</b></div><div class="sub">13 Oct 2026, 9:14 am</div><div class="box"><div><span>From</span><span>Rakesh Kumar</span></div><div><span>UPI ref</span><span>4021 8833 1190</span></div><div><span>App</span><span>PayFast UPI</span></div><div><span>Note</span><span>goa taxi share</span></div></div>`,
  },
  {
    name: "note-handwritten",
    w: 420,
    h: 360,
    html: `<style>body{margin:0;background:#cfc8b8;display:flex;justify-content:center;align-items:center;height:100vh}.n{width:320px;background:#fdf3b8;padding:24px 26px;transform:rotate(2deg);box-shadow:0 3px 8px #0003;font-family:"Bradley Hand","Segoe Print","Comic Sans MS",cursive;font-size:26px;color:#2a2a6a;line-height:1.5}</style>
    <div class="n">Goa extras<br>Mahima 500 drinks<br>Priya 250 snacks</div>`,
  },
  {
    name: "not-a-bill",
    w: 600,
    h: 420,
    html: `<style>body{margin:0;height:100vh;background:linear-gradient(#ff9a5a,#ffd27f 45%,#4aa3c7 46%,#1f5f80);position:relative;overflow:hidden;font-family:Helvetica}.sun{position:absolute;left:260px;top:120px;width:90px;height:90px;border-radius:50%;background:#fff3c4}.palm{position:absolute;left:60px;bottom:0;width:14px;height:240px;background:#3b2a1a;transform:rotate(-8deg)}.cap{position:absolute;bottom:18px;right:20px;color:#fff;font-size:28px;font-weight:700;text-shadow:0 2px 6px #0006}</style>
    <div class="sun"></div><div class="palm"></div><div class="cap">Goa sunsets 🌅</div>`,
  },
];

for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h ?? 900 }, deviceScaleFactor: 2 });
  await page.setContent(s.html);
  const el = s.h ? null : await page.$(".r");
  if (el) await el.screenshot({ path: `${OUT}/${s.name}.png` });
  else await page.screenshot({ path: `${OUT}/${s.name}.png` });
  await page.close();
  console.log("wrote", s.name);
}

// Two-page hotel invoice PDF.
const pdf = await browser.newPage();
await pdf.setContent(`<style>body{font-family:Helvetica,Arial;color:#222;padding:30px}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}td:last-child,th:last-child{text-align:right}.pb{page-break-before:always}</style>
<h1>Casa Anjuna</h1><p>Anjuna, North Goa · GSTIN 30ZZZZZ9999Z1Z9</p><h2>TAX INVOICE #CA-2026-1188</h2><p>Guest: Aman Verma · Check-in 09 Oct 2026 · Check-out 11 Oct 2026 · Rooms: 2</p>
<table><tr><th>Description</th><th>Qty</th><th>Amount (INR)</th></tr><tr><td>Deluxe room, sea view</td><td>2 rooms × 2 nights</td><td>7,600.00</td></tr><tr><td>Breakfast buffet</td><td>4 guests × 2</td><td>800.00</td></tr></table>
<div class="pb"><h2>Summary</h2><table><tr><td>Room &amp; breakfast</td><td></td><td>8,400.00</td></tr><tr><td>GST 12%</td><td></td><td>1,008.00</td></tr><tr><th>Grand total</th><th></th><th>9,408.00</th></tr></table><p>Paid in full by card ending 4521 on 11 Oct 2026. Thank you for staying with us.</p></div>`);
await pdf.pdf({ path: `${OUT}/hotel-invoice.pdf`, format: "A4" });
console.log("wrote hotel-invoice.pdf");
// The same invoice as one PNG per page, for evals that run outside a browser (no pdf.js in Node).
const css = `body{font-family:Helvetica,Arial;color:#222;padding:30px;margin:0;width:734px}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}td:last-child,th:last-child{text-align:right}`;
const pages = [
  `<h1>Casa Anjuna</h1><p>Anjuna, North Goa · GSTIN 30ZZZZZ9999Z1Z9</p><h2>TAX INVOICE #CA-2026-1188</h2><p>Guest: Aman Verma · Check-in 09 Oct 2026 · Check-out 11 Oct 2026 · Rooms: 2</p><table><tr><th>Description</th><th>Qty</th><th>Amount (INR)</th></tr><tr><td>Deluxe room, sea view</td><td>2 rooms × 2 nights</td><td>7,600.00</td></tr><tr><td>Breakfast buffet</td><td>4 guests × 2</td><td>800.00</td></tr></table><p style="margin-top:40px;color:#888">Page 1 of 2</p>`,
  `<h2>Summary</h2><table><tr><td>Room &amp; breakfast</td><td></td><td>8,400.00</td></tr><tr><td>GST 12%</td><td></td><td>1,008.00</td></tr><tr><th>Grand total</th><th></th><th>9,408.00</th></tr></table><p>Paid in full by card ending 4521 on 11 Oct 2026. Thank you for staying with us.</p><p style="margin-top:40px;color:#888">Page 2 of 2</p>`,
];
for (const [i, html] of pages.entries()) {
  const p = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.5 });
  await p.setContent(`<style>${css}</style>${html}`);
  await p.screenshot({ path: `${OUT}/hotel-invoice-page-${i + 1}.png` });
  await p.close();
}
await browser.close();
