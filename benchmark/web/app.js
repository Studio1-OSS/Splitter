// Where the dashboard is served from: "/" locally (pnpm bench:dev), "/benchmark/" on the deployed app.
const BASE = document.documentElement.dataset.base || '/';
const $ = (selector, parent = document) => parent.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name) => `<svg aria-hidden="true"><use href="${BASE}icons.svg#${name}"/></svg>`;
const chip = (label, kind = '', symbol = '') => `<span class="chip ${kind}">${symbol ? icon(symbol) : ''}${escape(label)}</span>`;
const fmt = new Intl.NumberFormat('en-US');
// Amounts are shown the way the bill prints them: rupiah as "Rp 73.450" (a dot for thousands, no decimals), rupees with
// Indian grouping. Everything else in en-US.
const LOCALE = { IDR: 'id-ID', INR: 'en-IN' };
const money = (value, currency) => {
  const whole = currency === 'IDR' && Number.isInteger(Math.round(value * 100) / 100);
  return new Intl.NumberFormat(LOCALE[currency] ?? 'en-US', { style: 'currency', currency, ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}) }).format(value);
};
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const pct = (r) => (r && r.n ? `${(100 * r.k / r.n).toFixed(r.k === r.n || r.k === 0 ? 0 : 1)}%` : 'n/a');
const ci = (r) => (r && r.n ? `95% CI ${Math.round(100 * r.lo)}–${Math.round(100 * r.hi)}%` : '');
const MODEL_URL = 'https://tokenfactory.nebius.com/?modals=endpoint-details&model-id=nvidia/Nemotron-3.5-Super-VL';
const REPO_URL = 'https://github.com/Studio1-OSS/Splitter';
const CATEGORY = { groceries: 'Groceries', party: 'Party', home: 'Home & rent', food: 'Food', travel: 'Travel' };
const titles = { overview: 'Benchmark', bills: 'Bills', method: 'Method', guide: 'Run it' };
// "All" is the 300-bill benchmark. Held-out receipts were never looked at while building or tuning, and stay separate.
const TRACKS = { all: 'All', synthetic: 'Synthetic', real: 'Real receipts', holdout: 'Held-out' };
const MAIN = ['synthetic', 'real'];
let data, toastTimer;
let selected = null, filter = 'all', category = 'all', search = '', detailTab = 'split';
let track = 'all';
// Reasoning off is what Splitter uses; "on" swaps in the same bills run with Token Factory's reasoning_effort: "medium".
let mode = 'off', full = null;
try { mode = localStorage.getItem('receipt-lab-reasoning') === 'on' ? 'on' : 'off'; } catch { /* works without storage */ }
try { track = Object.hasOwn(TRACKS, localStorage.getItem('receipt-lab-track')) ? localStorage.getItem('receipt-lab-track') : 'all'; } catch { /* works without storage */ }

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2600);
}

// Theme: follows the system unless the visitor picks one.
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
function setTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  $('#theme-toggle').setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
}
try { setTheme(localStorage.getItem('receipt-lab-theme')); } catch { setTheme(null); }
$('#theme-toggle').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  setTheme(next);
  try { localStorage.setItem('receipt-lab-theme', next); } catch { /* works without storage */ }
});

const caseFor = (id) => data.cases.find((c) => c.id === id);
const rowFor = (id) => data.rows.find((r) => r.id === id);
const setOf = (r) => r.set ?? 'synthetic';
const hasReal = () => data.rows.some((r) => setOf(r) === 'real');
// The selected track's rows and summary. "all" is the combined view.
const rowsT = () => (track === 'all' ? data.rows.filter((r) => MAIN.includes(setOf(r))) : data.rows.filter((r) => setOf(r) === track));
const S = () => data.summaries?.[track] ?? data.summary;
const billName = (c) => c?.truth.merchant ?? (c?.set === 'real' ? 'Real receipt' : c?.set === 'holdout' ? 'Held-out receipt' : c?.id ?? '');
const trackCount = (t) => (t === 'all' ? data.rows.filter((r) => MAIN.includes(setOf(r))).length : data.rows.filter((r) => setOf(r) === t).length);
const hasOn = () => Boolean(full?.reasoningOn);
function applyMode() {
  if (mode === 'on' && !hasOn()) mode = 'off';
  data = mode === 'on' ? { ...full, ...full.reasoningOn, cases: full.cases } : full;
}
function modeSwitch() {
  if (!hasOn()) return '';
  return `<div class="segmented mode-switch" role="group" aria-label="Model reasoning">${[['off', 'Reasoning off'], ['on', 'Reasoning on']].map(([k, l]) => `<button data-mode="${k}" class="${mode === k ? 'active' : ''}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>`;
}
// Off vs on for the selected track, from the two saved runs.
function reasoningCompare() {
  if (!hasOn()) return '';
  const off = full.summaries?.[track] ?? full.summary, on = full.reasoningOn.summaries?.[track];
  if (!off || !on) return '';
  const rows = [
    ['Splits correct to the cent', (s) => pct(s.overall.splitCorrect), (s) => s.overall.splitCorrect],
    ['Bill read completely', (s) => pct(s.overall.extractionCorrect), (s) => s.overall.extractionCorrect],
    ['Split right when read right', (s) => pct(s.overall.splitCorrectGivenRead), (s) => s.overall.splitCorrectGivenRead],
    ['Split by the model\'s own tool call', (s) => `${s.overall.modelComputed.k}/${s.overall.modelComputed.n}`],
    ['Median time per bill', (s) => seconds(s.latencyMs.p50)],
    ['Output tokens per bill', (s) => fmt.format(s.tokens.perBillOut)],
    ['Cost per bill', (s) => (s.costUsd ? `$${s.costUsd.perBill.toFixed(4)}` : 'n/a')],
  ];
  return `<section class="section"><div class="section-head"><div><span class="eyebrow">${icon('workflow')} Reasoning off vs on</span><h2>Does thinking first help?</h2><p>The same ${off.overall.bills} bills, run twice. Off is what Splitter uses (temperature 0). On uses Token Factory's <code>reasoning_effort: "medium"</code>, its default level, with default sampling.</p></div></div>
    <div class="table-wrap card"><table class="compare"><thead><tr><th>Metric</th><th class="n">Reasoning off</th><th class="n">Reasoning on</th></tr></thead><tbody>${rows.map(([l, f, r]) => `<tr><td>${l}</td><td class="n">${f(off)}${r ? `<small>${ci(r(off))}</small>` : ''}</td><td class="n">${f(on)}${r ? `<small>${ci(r(on))}</small>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function trackSwitch() {
  if (!hasReal()) return '';
  return `<div class="segmented track-switch" role="group" aria-label="Benchmark track">${Object.entries(TRACKS).filter(([k]) => trackCount(k)).map(([k, l]) => `<button data-track="${k}" class="${track === k ? 'active' : ''}" aria-pressed="${track === k}">${l} <span class="count">${trackCount(k)}</span></button>`).join('')}</div>`;
}
// Wilson 95% interval, for groupings computed in the page.
function rate(k, n) {
  if (!n) return { k, n, lo: 0, hi: 0 };
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { k, n, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}
function groupBy(rows, keyOf, order) {
  const groups = {};
  for (const r of rows) (groups[keyOf(r)] ??= []).push(r);
  return Object.fromEntries((order ?? Object.keys(groups)).filter((k) => groups[k]).map((k) => {
    const rs = groups[k], planted = rs.filter((r) => r.planted);
    return [k, { bills: rs.length, extractionCorrect: rate(rs.filter((r) => r.extractionCorrect).length, rs.length), splitCorrect: rate(rs.filter((r) => r.splitCorrect).length, rs.length), plantedCaught: rate(planted.filter((r) => r.flagged).length, planted.length) }];
  }));
}
const isIssue = (r) => !r.ok || !r.splitCorrect || !r.extractionCorrect || (r.flagged && !r.planted && r.extractionCorrect) || (r.planted && !r.flagged);
const status = (r) =>
  !r.ok ? chip('Run failed', 'warn', 'alert')
    : r.planted ? chip(r.flagged ? 'Error caught' : 'Error missed', r.flagged ? '' : 'warn', r.flagged ? 'shield' : 'alert')
      : !r.extractionCorrect ? chip(r.splitCorrect ? 'Misread · split ok' : 'Misread', 'warn', 'eye')
        : !r.splitCorrect ? chip('Wrong split', 'warn', 'alert')
          : chip('Correct', '', 'check');

// ── Benchmark ───────────────────────────────────────────────────────────────
function band() {
  const o = S().overall, cost = S().costUsd;
  const third = o.plantedCaught.n
    ? [`${o.plantedCaught.k}<small>/ ${o.plantedCaught.n}</small>`, 'Planted wrong totals caught', `${o.falseAlarms.k} false alarms on correctly read bills`]
    : [pct(o.extractionCorrect), 'Receipts read completely', `every line, charge and total · ${o.falseAlarms.k} false alarms`];
  const stats = [
    [pct(o.splitCorrect), 'Splits correct to the cent', `${o.splitCorrect.k} of ${o.splitCorrect.n} bills · ${ci(o.splitCorrect)}`],
    [pct(o.modelComputed), 'Computed by the model', `its own <code>allocate_tax_tip</code> call ${o.modelComputed.k === o.modelComputed.n ? 'on every bill' : `on ${o.modelComputed.k} of ${o.modelComputed.n} bills`}`],
    third,
    [cost ? `$${cost.perBill.toFixed(4)}` : 'n/a', 'Cost per bill', cost ? `$${cost.per1000Bills.toFixed(2)} per 1,000 · median ${seconds(S().latencyMs.p50)}` : ''],
  ];
  return `<section class="band" aria-label="Headline results"><span class="eyebrow">${icon('shield')} Headline results · ${o.bills} ${track === 'real' ? 'real receipts' : track === 'holdout' ? 'held-out real receipts' : track === 'synthetic' ? 'synthetic bills' : 'bills'} · reasoning ${mode} · real model runs</span><div class="band-grid">${stats.map(([v, l, f]) => `<div class="stat"><div class="stat-value">${v}</div><div class="stat-label">${l}</div><div class="stat-foot">${f}</div></div>`).join('')}</div></section>`;
}

function modelCard() {
  const p = data.price || {}, info = data.modelInfo || {};
  return `<section class="card stone model-card"><div class="card-head"><div><span class="eyebrow">${icon('layers')} Model under test</span><h2>${escape(data.model)}</h2></div><a class="button" href="${MODEL_URL}" target="_blank" rel="noreferrer">View on Token Factory ${icon('external')}</a></div><dl class="facts">
    <div><dt>Endpoint</dt><dd><code>${escape(data.baseURL)}</code></dd></div>
    <div><dt>Price</dt><dd>$${Number(p.inPerM).toFixed(2)} per 1M input · $${Number(p.outPerM).toFixed(2)} per 1M output</dd></div>
    <div><dt>Model</dt><dd>${escape(info.modality ?? 'text+image->text')} · ${info.contextLength ? `${fmt.format(info.contextLength)} context` : ''} · ${escape(info.quantization ?? '')}</dd></div>
    <div><dt>Bill read</dt><dd>JSON schema · ${mode === 'on' ? 'reasoning on (<code>reasoning_effort: medium</code>) · default temperature' : 'reasoning off · temperature 0'}</dd></div>
    <div><dt>Tool loop</dt><dd>Native function calling · <code>tool_choice: ${escape(data.toolChoice)}</code>${mode === 'on' ? ' · reasoning on' : ''}</dd></div>
    ${runLine()}</dl></section>`;
}

function runLine() {
  const sets = data.sets ?? { synthetic: { date: data.date, settings: data.settings } };
  const shown = Object.entries(sets).filter(([k]) => track === 'all' || k === track);
  const when = (r) => `${escape(new Date(r.date).toUTCString().slice(5, 22))} UTC`;
  return `<div><dt>${shown.length > 1 ? 'Runs' : 'Run'}</dt><dd>${shown.map(([k, r]) => `${shown.length > 1 ? `${escape(TRACKS[k])}: ` : ''}${when(r)}`).join(' · ')} · settings <code>${escape([...new Set(shown.map(([, r]) => r.settings))].join(', '))}</code></dd></div>`;
}

function bars(groups, key) {
  return `<div class="bars">${Object.entries(groups).map(([name, b]) => {
    const r = b[key], v = r.n ? r.k / r.n : 0;
    return `<div class="bar-row"><span class="bar-name">${escape(CATEGORY[name] ?? name)}</span><span class="bar-track" role="img" aria-label="${escape(CATEGORY[name] ?? name)}: ${pct(r)}, ${ci(r)}"><span class="bar-fill" style="width:${v * 100}%"></span><span class="bar-ci" style="left:${r.lo * 100}%;width:${(r.hi - r.lo) * 100}%"></span></span><span class="bar-value">${pct(r)}<small>${r.k}/${r.n}</small></span></div>`;
  }).join('')}</div><div class="legend"><span><i></i>Result</span><span><i class="ci"></i>95% confidence interval</span></div>`;
}

function readingVsReasoning() {
  const o = S().overall;
  const rows = [
    ['eye', 'Bill read completely', `${pct(o.extractionCorrect)}<small>${o.extractionCorrect.k}/${o.extractionCorrect.n}</small>`],
    ['workflow', 'Split right when the bill was read right', `${pct(o.splitCorrectGivenRead)}<small>${o.splitCorrectGivenRead.k}/${o.splitCorrectGivenRead.n}</small>`],
    ['shield', 'Misreads flagged by <code>check_receipt</code>', `${o.misreadsFlagged.k}/${o.misreadsFlagged.n}`],
    ['alert', 'False alarms on correctly read bills', `${o.falseAlarms.k}/${o.falseAlarms.n}`],
    ['check', 'App validation rule passed', pct(o.validationOk)],
  ];
  return `<ul class="check-list">${rows.map(([s, l, v]) => `<li>${icon(s)}<span>${l}</span><strong>${v}</strong></li>`).join('')}</ul><p class="small">${fmt.format(S().tokens.perBillIn)} input / ${fmt.format(S().tokens.perBillOut)} output tokens per bill · ${S().retries} network retries · $${S().costUsd?.total.toFixed(3) ?? 'n/a'} for the whole run</p>`;
}

function breakdown(groups, title) {
  const planted = Object.values(groups).some((b) => b.plantedCaught.n);
  return `<div class="table-wrap"><table class="breakdown"><caption class="sr-only">${escape(title)}</caption><thead><tr><th>${escape(title)}</th><th class="n">Read</th><th class="n">Split</th>${planted ? '<th class="n">Planted</th>' : ''}</tr></thead><tbody>${Object.entries(groups).map(([k, b]) => `<tr><td><span class="group-name">${escape(CATEGORY[k] ?? k)}</span><span class="meta">${b.bills} bills</span></td><td class="n">${pct(b.extractionCorrect)}</td><td class="n">${pct(b.splitCorrect)}</td>${planted ? `<td class="n">${b.plantedCaught.n ? `${b.plantedCaught.k}/${b.plantedCaught.n}` : '–'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function misses() {
  const rows = rowsT().filter(isIssue);
  if (!rows.length) return '<div class="empty">No misses in this run.</div>';
  return `<div class="miss-grid">${rows.map((r) => {
    const c = caseFor(r.id);
    const why = !r.extractionCorrect && misreadKind(r) === 'scale' ? `Read the number format wrong: amounts 1,000× too small.${r.flagged ? ' check_receipt flagged it.' : ''}` : !r.extractionCorrect ? `The model misread the bill.${r.flagged ? ' check_receipt flagged it.' : ' Nothing flagged it.'}` : !r.splitCorrect ? 'Read correctly, but a line went to the wrong people.' : r.planted && !r.flagged ? 'The planted total slipped through.' : 'Flag on a correct bill.';
    return `<a class="miss" href="#bills/${escape(r.id)}"><img src="${BASE}dataset/${escape(c.file)}" alt=""><div><span class="id">${escape(r.id)}</span><strong>${escape(billName(c))}</strong><p>${escape(why)}</p><span class="meta">${c.source ? escape(c.source) : `${escape(c.layout)} · ${escape(c.condition)} · ${escape(c.currency)}`}</span></div></a>`;
  }).join('')}</div>`;
}

// Why a read went wrong, from what the model returned vs the labels.
function misreadKind(r) {
  const t = caseFor(r.id)?.truth, x = r.extracted;
  if (!t || !x) return 'other';
  if (x.total && [1000, 100].some((f) => Math.abs(x.total * f - t.total) < 1)) return 'scale';
  if ((x.items?.length ?? 0) !== t.items.length) return 'lines';
  if (Math.abs((x.total ?? 0) - t.total) < 0.005 && r.linesPriced === t.items.length) return 'charges';
  return 'other';
}
function realMisreads(rows) {
  const misread = rows.filter((r) => r.ok && !r.extractionCorrect);
  const count = (k) => misread.filter((r) => misreadKind(r) === k).length;
  const kinds = [
    ['scale', 'Number format', `“60.000” or “60,000” read as 60, so every amount came out 1,000× too small. The maths still adds up, so <code>check_receipt</code> can't see it.`],
    ['charges', 'Charges', 'Lines and total right, but tax or service charge missed or swapped.'],
    ['lines', 'Line items', 'A line added (a zero-priced item, a coupon) or missed.'],
    ['other', 'Other', 'A price or the total read differently.'],
  ];
  return `<article class="card" style="margin-top:24px"><div class="card-head"><div><h3>Where real receipts go wrong</h3><p>${misread.length} of ${rows.length} receipts misread, by cause</p></div></div><div class="cause-grid">${kinds.map(([k, l, d]) => `<div class="cause"><div class="cause-value">${count(k)}</div><div class="cause-label">${l}</div><p>${d}</p></div>`).join('')}</div></article>`;
}

function resultCards() {
  const S_ = S(), rows = rowsT();
  if (track === 'real' || track === 'holdout') {
    const lines = (r) => (r.linesTotal <= 2 ? '2 lines' : r.linesTotal === 3 ? '3 lines' : r.linesTotal <= 5 ? '4–5 lines' : '6+ lines');
    const charges = (r) => { const c = caseFor(r.id)?.truth ?? {}; return c.serviceCharge != null ? 'Tax + service' : c.tax != null ? 'Tax only' : c.discount != null ? 'Discount' : 'No charges'; };
    const o = S_.overall;
    const metrics = { 'Line prices read': o.linesPriced, 'Printed total read': o.totalRead, 'Tax read': o.taxRead, 'Read completely': o.extractionCorrect, 'Split correct': o.splitCorrect };
    return `<div class="grid-2"><article class="card"><div class="card-head"><div><h3>Real receipts, step by step</h3><p>From reading the photo to the split</p></div></div>${bars(Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, { m: v }])), 'm')}</article>
    <article class="card"><div class="card-head"><div><h3>Reading vs reasoning</h3><p>Where the remaining errors come from</p></div></div>${readingVsReasoning()}</article></div>
    <div class="grid-3" style="margin-top:24px"><article class="card"><h3>By receipt length</h3><p>Read completely · split correct</p><div style="margin-top:16px">${breakdown(groupBy(rows, lines, ['2 lines', '3 lines', '4–5 lines', '6+ lines']), 'Lines')}</div></article><article class="card"><h3>By charges</h3><p>What sits between lines and total</p><div style="margin-top:16px">${breakdown(groupBy(rows, charges, ['No charges', 'Tax only', 'Tax + service', 'Discount']), 'Charges')}</div></article><article class="card"><h3>By group size</h3><p>People in the note</p><div style="margin-top:16px">${breakdown(groupBy(rows, (r) => `${r.people} people`, ['2 people', '3 people', '4 people', '5 people']), 'Group')}</div></article></div>${realMisreads(rows)}`;
  }
  const byTrack = track === 'all' && hasReal();
  const first = byTrack
    ? `<h3>Correct splits by track</h3><p>Synthetic by category, then real photos</p></div></div>${bars({ ...data.summaries.synthetic.byCategory, 'Real receipts': data.summaries.real.overall }, 'splitCorrect')}`
    : `<h3>Correct splits by category</h3><p>30 bills each</p></div></div>${bars(S_.byCategory, 'splitCorrect')}`;
  const sizes = (groups) => [...new Set(Object.values(groups).map((b) => b.bills))];
  const each = (groups, unit = 'bills') => { const n = sizes(groups); return n.length === 1 ? `${n[0]} ${unit} each` : 'Bills per group vary'; };
  return `<div class="grid-2"><article class="card"><div class="card-head"><div>${first}</article>
    <article class="card"><div class="card-head"><div><h3>Reading vs reasoning</h3><p>Where the remaining errors come from</p></div></div>${readingVsReasoning()}</article></div>
    ${byTrack ? realMisreads(data.rows.filter((r) => setOf(r) === 'real')) : ''}<div class="grid-3" style="margin-top:24px"><article class="card"><h3>By layout</h3><p>Read completely · split correct · planted caught</p><div style="margin-top:16px">${breakdown(S_.byLayout, 'Layout')}</div></article><article class="card"><h3>By photo condition</h3><p>Long = 9–12 lines${byTrack ? ' · real = CORD photo' : ''}</p><div style="margin-top:16px">${breakdown(S_.byCondition, 'Condition')}</div></article><article class="card"><h3>By currency</h3><p>${each(S_.byCurrency)}</p><div style="margin-top:16px">${breakdown(S_.byCurrency, 'Currency')}</div></article></div>`;
}

function overview() {
  const o = S().overall, n = trackCount('real');
  const eyebrow = !hasReal() ? `${trackCount('all')} synthetic bills` : track === 'real' ? `${n} real receipt photos (CORD v2)` : track === 'holdout' ? `${trackCount('holdout')} held-out real receipts (CORD v2)` : track === 'synthetic' ? `${trackCount('synthetic')} synthetic bills` : `${trackCount('all')} bills · ${trackCount('synthetic')} synthetic + ${n} real photos`;
  const tag = o.plantedCaught.n ? `${o.plantedCaught.k}/${o.plantedCaught.n} wrong totals caught · ${pct(o.linesPriced)} of lines read exactly` : `${pct(o.linesPriced)} of lines read exactly on real photos`;
  const note = track === 'synthetic'
    ? 'An application-level evaluation on synthetic bills, not an official benchmark.</strong> Real photos (glare, folds, handwriting) and ambiguous notes are harder; switch to the real-receipt track to see how much.'
    : 'An application-level evaluation, not an official benchmark.</strong> Real receipts come from CORD v2 (Indonesian restaurants and cafés, CC BY 4.0); who had what is generated for them. Measure on your own bills before relying on it.';
  return `<section class="hero"><div><span class="eyebrow">${icon('book')} Splitter benchmark · ${eyebrow}</span><h1>Read the bill.<br>Do the maths <em>with tools.</em></h1><p>${escape(data.model)} reads each bill, works out who had what from a plain-English note, and calls calculator tools for every number. The app only checks the answer.</p><div class="actions"><a class="button" href="#bills">Explore the bills ${icon('arrow')}</a><a class="text-link" href="#method">How it was measured ${icon('arrow')}</a></div></div>
    <div class="hero-art" aria-hidden="true"><img class="a" src="${BASE}dataset/home-01.png" alt=""><img class="b" src="${BASE}dataset/${hasReal() && track !== 'synthetic' ? 'real/real-013.jpg' : 'food-03.png'}" alt=""><span class="tag">${icon('shield')}${tag}</span></div></section>
  <div class="track-bar">${trackSwitch()}${modeSwitch()}</div>
  ${track === 'holdout' ? `<p class="note" style="margin:0 0 24px"><strong>A fair check of the real-receipt numbers.</strong> These ${trackCount('holdout')} receipts come straight after the 150 in the same fixed order from CORD v2, chosen by the same rules, and were never looked at while building the benchmark or writing the prompt.</p>` : ''}
  ${band()}${modelCard()}${reasoningCompare()}
  <section class="section"><div class="section-head"><div><span class="eyebrow">Results</span><h2>Where it's right, and where it isn't</h2></div></div>${resultCards()}</section>
  <section class="section"><div class="section-head"><div><span class="eyebrow">Every miss, in the open</span><h2>${rowsT().filter(isIssue).length} bills worth a closer look</h2><p>Open one to see the image, what the model read, its tool calls and its split.</p></div><a class="text-link" href="#bills">All ${rowsT().length} bills ${icon('arrow')}</a></div>${misses()}</section>
  <p class="note"><strong>${note}</p>`;
}

// ── Bills ───────────────────────────────────────────────────────────────────
function matches(row) {
  const c = caseFor(row.id);
  const text = `${row.id} ${row.layout} ${row.condition} ${c?.truth.merchant ?? ''} ${c?.source ?? ''} ${row.currency}`.toLowerCase();
  const byFilter = filter === 'all' || (filter === 'issues' && isIssue(row)) || (filter === 'planted' && row.planted) || (filter === 'clean' && !row.planted);
  return text.includes(search.toLowerCase()) && byFilter && (category === 'all' || row.category === category);
}

function billList() {
  const rows = rowsT().filter(matches);
  return `<div class="list-scroll">${rows.map((r) => {
    const c = caseFor(r.id);
    return `<button class="bill-row ${r.id === selected ? 'selected' : ''}" data-bill="${escape(r.id)}" aria-pressed="${r.id === selected}"><span class="who"><span class="id">${escape(r.id)}</span><span class="name">${escape(billName(c))}</span><span class="meta">${c?.source ? `${escape(c.source)} · ${escape(r.currency)}` : `${escape(r.layout)} · ${escape(r.condition)} · ${escape(r.currency)}`} · ${r.linesTotal} lines · ${r.people} people</span></span><span class="right">${status(r)}<span class="time">${seconds(r.ms)}</span></span></button>`;
  }).join('') || '<div class="empty">No matching bills.</div>'}</div><div class="list-foot">${rows.length} of ${rowsT().length} bills</div>`;
}

function splitTab(c, r) {
  return `<div class="label">The note</div><p class="quote">${escape(c.note)}</p><div class="label">The model's split (its own tool call) vs expected</div><div class="table-wrap"><table><thead><tr><th>Person</th><th class="n">Model</th><th class="n">Expected</th><th></th></tr></thead><tbody>${c.people.map((n) => {
    const m = r.modelSplit?.[n] ?? 0, e = r.expected?.[n] ?? 0, same = Math.abs(m - e) < 0.005;
    return `<tr><td>${escape(n)}</td><td class="n ${same ? '' : 'bad'}">${money(m, c.currency)}</td><td class="n">${money(e, c.currency)}</td><td>${same ? icon('check') : icon('alert')}</td></tr>`;
  }).join('')}</tbody></table></div>${r.explanation ? `<p class="small">Model: “${escape(r.explanation)}”</p>` : ''}`;
}

function readTab(c, r) {
  const read = r.extracted?.items ?? [];
  const t = c.truth, x = r.extracted ?? {};
  const same = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < 0.005;
  const charge = (label, truth, got) => `<tr><td></td><td>${label}</td><td class="n">${truth == null ? '–' : money(truth, c.currency)}</td><td class="n ${same(truth, got) ? '' : 'bad'}">${got == null ? '–' : money(got, c.currency)}</td></tr>`;
  return `<div class="label">What the model read vs the truth</div><div class="table-wrap"><table><thead><tr><th>#</th><th>Line</th><th class="n">Truth</th><th class="n">Read</th></tr></thead><tbody>${t.items.map((it, i) => {
    const hit = read.find((y) => Math.abs(y.totalPrice - it.totalPrice) < 0.005);
    return `<tr><td class="n">${i + 1}</td><td>${escape(it.name)}</td><td class="n">${money(it.totalPrice, c.currency)}</td><td class="n ${hit ? '' : 'bad'}">${hit ? money(hit.totalPrice, c.currency) : 'not read'}</td></tr>`;
  }).join('')}${charge('Tax', t.tax, x.tax)}${charge('Tip', t.tip, x.tip)}${charge('Service charge', t.serviceCharge, x.serviceCharge)}${charge('Discount', t.discount, x.discount)}${charge('<strong>Printed total</strong>', t.total, x.total)}</tbody></table></div>${c.source ? `<p class="small">Ground truth: CORD v2's human labels (${escape(c.source)}). Amounts in whole rupiah.</p>` : ''}${c.planted ? `<p class="small">Planted error: the printed total is wrong on purpose. Lines and charges come to ${money(t.correctTotal, c.currency)}.</p>` : ''}`;
}

function traceTab(r) {
  if (!r.trace?.length) return '<div class="empty">No tool calls recorded.</div>';
  return `<div class="label">Tool calls, in order</div><ol class="timeline">${r.trace.map((t) => `<li class="${t.ok ? '' : 'flagged'}"><span class="dot">${icon(t.ok ? 'check' : 'alert')}</span><div><div class="row"><code>${escape(t.tool)}</code><span class="by ${t.by}">${escape(t.by)}</span><span class="meta">${t.ms}ms</span></div><details><summary>Arguments and result</summary><pre>${escape(JSON.stringify(t.args, null, 1))}\n→ ${escape(JSON.stringify(t.result, null, 1))}</pre></details></div></li>`).join('')}</ol><p class="small">${r.calls?.length ?? 0} model calls · ${fmt.format(r.tokensIn)} in + ${fmt.format(r.tokensOut)} out tokens · $${r.costUsd?.toFixed(5) ?? 'n/a'}. “model” = the model chose the call; “app” = the app's validation rule.</p>`;
}

function billDetail() {
  const c = caseFor(selected), r = rowFor(selected);
  if (!c || !r) return '<div class="empty">Select a bill.</div>';
  const tabs = [['split', 'Split'], ['read', 'Read'], ['trace', 'Tool calls']];
  return `<div class="detail-head"><span class="eyebrow">${escape(c.id)} · ${c.source ? escape(c.source) : `${escape(CATEGORY[c.category])} · ${escape(c.layout)} · ${escape(c.condition)}`}</span><h2>${escape(billName(c))}</h2><div class="chips">${status(r)}${chip(`${c.people.length} people`, 'info')}${chip(seconds(r.ms), 'info')}${chip(c.currency, 'info')}</div></div><div class="preview"><img src="${BASE}dataset/${escape(c.file)}" alt="${c.set === 'real' ? `Real receipt photo ${escape(c.id)} from CORD v2` : `Synthetic ${escape(billName(c))} bill ${escape(c.id)}`}"><button class="icon-button" data-action="expand" aria-label="Open bill ${escape(c.id)} full size">${icon('expand')}</button></div><div class="detail-body"><div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-detail="${k}" aria-selected="${detailTab === k}" class="${detailTab === k ? 'active' : ''}">${l}</button>`).join('')}</div>${detailTab === 'trace' ? traceTab(r) : detailTab === 'read' ? readTab(c, r) : splitTab(c, r)}</div>`;
}

function bills() {
  const rows = rowsT();
  if (!selected || !rows.some((r) => r.id === selected)) selected = (rows.find(isIssue) ?? rows[0]).id;
  const issues = rows.filter(isIssue).length;
  const filters = [['all', `All ${rows.length}`], ['issues', `Misses ${issues}`], ...(rows.some((r) => r.planted) ? [['planted', 'Planted errors'], ['clean', 'Correct bills']] : [])];
  if (!filters.some(([k]) => k === filter)) filter = 'all';
  const categories = [...new Set(rows.map((r) => r.category))];
  if (!categories.includes(category)) category = 'all';
  return `<div class="page-intro"><span class="eyebrow">${icon('database')} ${rows.length} bills, all open</span><h1>Every bill. Every tool call.</h1><p>Compare what the model read with the truth, follow its tool calls, and check its split against the expected one.</p><div class="track-bar">${trackSwitch()}${modeSwitch()}</div></div>
  <div class="toolbar"><div class="segmented" role="group" aria-label="Filter bills">${filters.map(([k, l]) => `<button data-filter="${k}" class="${filter === k ? 'active' : ''}" aria-pressed="${filter === k}">${l}</button>`).join('')}</div>${categories.length > 1 ? `<label class="field">${icon('layers')}<select id="category-filter" aria-label="Category"><option value="all">All categories</option>${Object.entries(CATEGORY).filter(([k]) => categories.includes(k)).map(([k, v]) => `<option value="${k}" ${category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}<label class="field search">${icon('search')}<input type="search" id="bill-search" placeholder="Search merchant, ID, source…" aria-label="Search bills" value="${escape(search)}"></label></div>
  <div class="explorer"><section class="list" aria-label="Bill list">${billList()}</section><section class="detail" aria-label="Selected bill">${billDetail()}</section></div>`;
}

// ── Method ──────────────────────────────────────────────────────────────────
function method() {
  const defs = [
    ['Bill read', 'Every line price, the tax, tip, service charge, discount and printed total read exactly.'],
    ['Split correct', "The model's own allocate_tax_tip shares equal the expected split to the cent. No tool call counts as wrong."],
    ['Planted errors', 'Caught when check_receipt fails and the model reports the problem.'],
    ['False alarm', 'A flag on a correct bill that was also read correctly. A flag after a misread counts as a catch.'],
    ['Cost', 'Tokens reported by each call × the live price from GET /v1/models?verbose=true.'],
    ['Reasoning', 'Off (what Splitter uses): reasoning disabled, temperature 0. On: Token Factory\'s reasoning_effort "medium", its default level, with default sampling. Same bills, same tools, same scoring.'],
  ];
  return `<div class="page-intro"><span class="eyebrow">${icon('workflow')} The recipe and the method</span><h1>The model reasons.<br>Tools do the maths.</h1><p>Every split here is the model's own calculator-tool result. The app adds one validation rule and scores the answer against ground truth.</p></div>
  <div class="pipeline">${[['01', 'See', 'Vision → bill JSON: lines, tax, tip, fees, total'], ['02', 'Reason', 'The note → who had each line'], ['03', 'Calculate', 'check_receipt, allocate_tax_tip, validate_total'], ['04', 'Check', 'App rule: shares = lines + charges']].map(([n, t, d]) => `<div class="step"><span class="n">${n}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  <section class="section"><div class="grid-2">
    <article class="card"><h3>Synthetic bills</h3><p>150 synthetic bills: 30 each of groceries, party, home & rent, food and travel. In every category: 10 INR / 10 USD / 10 EUR; 12 clean, 6 faded, 6 rotated, 6 long; 6 planted wrong totals (20%) balanced across currency, layout and condition; groups of 2–5. Merchants and lines fit the category. A fixed seed, rendered in Chrome, so anyone can rebuild it.</p></article>
    <article class="card"><h3>Real receipts</h3><p>150 photographed restaurant and café receipts from <a class="text-link" href="https://huggingface.co/datasets/naver-clova-ix/cord-v2" target="_blank" rel="noreferrer">CORD v2</a> (Indonesia, rupiah, CC BY 4.0), with CORD's human labels as ground truth. Kept in a fixed order when the labels are unambiguous and add up: 2+ lines, unique names, no priced add-ons, lines + tax + service − discount = total. Who had what is generated, as for the synthetic set. No planted errors: these totals are real.</p></article>
    <article class="card"><h3>Held-out receipts</h3><p>100 more CORD v2 receipts, picked by the same rules in the same order right after the 150, and scored once after Splitter's prompt was final. They check the real-track numbers on receipts nobody had looked at, so they're reported on their own, not inside the 300.</p></article>
    <article class="card"><h3>Ground truth</h3><p>Every line, charge and printed total, who had what, and the expected split from Splitter's integer money engine (largest-remainder rounding, ties by group order). The note the model reads is written from the same truth.</p></article>
    <article class="card"><h3>What is scored</h3><dl class="def-list" style="margin-top:12px">${defs.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl></article>
    <article class="card"><h3>Honest reporting</h3><p>Failed runs count as failures. Only network errors (HTTP 429/5xx, timeouts) are retried, up to 3 times, and the count is reported. Every rate has a Wilson 95% interval. A settings fingerprint (model, endpoint, prompts, tools) marks comparable runs. Two full synthetic runs with the same settings agreed on all 150 bills. Each track records its own run date and fingerprint. In the reasoning-on run, 71 bills hit a network outage and were rerun once; those retries are counted.</p></article>
  </div></section>
  <section class="limits"><span class="eyebrow" style="color:var(--band-muted)">Limits</span><h2>What this does and doesn't show</h2><p>The real track is one kind of receipt (Indonesian restaurants, one currency) and its notes are generated, so it measures reading real photos more than reasoning about real groups. On synthetic bills, misreads cluster on A4 invoices, especially rotated ones. The calculator tools check arithmetic, not intent: a line given to the wrong person still adds up, so people should review assignments. This lab tests image understanding, reasoning and tool calls only.</p></section>`;
}

// ── Run it ──────────────────────────────────────────────────────────────────
const commands = {
  setup: 'git clone https://github.com/Studio1-OSS/Splitter\ncd Splitter && pnpm install\ncp .env.example .env   # add NEBIUS_API_KEY',
  agent: ['pnpm bench:agent benchmark/dataset/party-01.png \\', '  "Everyone shared the DJ booking 3h, Priya had the Sparkling wine x2, everyone shared the Birthday cake 2kg." \\', '  Aman,Priya'].join('\n'),
  eval: 'pnpm bench:eval                  # both tracks, 300 bills, reasoning off\npnpm bench:eval --reasoning on    # the same bills with reasoning on\npnpm bench:eval --set real        # or --set synthetic\npnpm bench:eval --limit 10 --concurrency 2',
  ui: 'pnpm bench:dev                   # http://localhost:3001\npnpm bench:dataset               # rebuild the synthetic bills (needs Chrome)\npnpm bench:import-real           # re-import the real receipts (Python)',
};
const codeBlock = (key) => `<div class="code-block"><pre><code>${escape(commands[key])}</code></pre><button class="copy-button" data-copy="${key}" aria-label="Copy commands">${icon('copy')}</button></div>`;

function guide() {
  const files = `<dl class="file-list">${[['benchmark/receipt-agent.mts', 'see → reason → calculate'], ['benchmark/eval.mts', 'runner + scoring'], ['benchmark/stats.mts', 'live prices, Wilson intervals'], ['benchmark/dataset/', '150 synthetic bills + cases.json'], ['benchmark/dataset/real/', '150 CORD v2 photos + cases.json'], ['benchmark/server.mts', 'this dashboard'], ['src/server/ai/tools.ts', 'the calculator tools'], ['src/server/ai/nebius.ts', 'model adapter + tool loop']].map(([f, d]) => `<div><dt>${f}</dt><dd>${d}</dd></div>`).join('')}</dl>`;
  return `<div class="page-intro"><span class="eyebrow">${icon('terminal')} Your key. Your bills. Your results.</span><h1>Run it yourself.</h1><p>The benchmark lives in the Splitter repo and reuses the app's own model adapter, bill schema and calculator tools.</p></div>
  <div class="guide"><div class="guide-steps">
    <article class="card"><h3>1 · Set up</h3><p>Node.js 22+ and pnpm, plus a Nebius Token Factory key in <code>.env</code>.</p>${codeBlock('setup')}</article>
    <article class="card"><h3>2 · Run one bill</h3><p>Prints what the model read, each tool call, its split and the validation result.</p>${codeBlock('agent')}<p class="cost">Real model calls on your key: about $0.003 per bill.</p></article>
    <article class="card"><h3>3 · Run the benchmark</h3><p>Writes <code>benchmark/results.json</code> and <code>results.md</code>, and updates the README. Running one track keeps the other's saved results. Reload this page to see the new run.</p>${codeBlock('eval')}</article>
    <article class="card"><h3>4 · Open this lab</h3><p>Reads saved results only: no model calls, no key needed.</p>${codeBlock('ui')}</article>
  </div><aside class="card stone"><h3>What's where</h3>${files}<div class="aside-links"><a class="text-link" href="${REPO_URL}" target="_blank" rel="noreferrer">Splitter on GitHub ${icon('external')}</a><a class="text-link" href="${MODEL_URL}" target="_blank" rel="noreferrer">The model on Token Factory ${icon('external')}</a></div><div style="margin-top:20px"><a class="pill-outline" href="${BASE}results.json" download>${icon('download')}Download results.json</a></div></aside></div>`;
}

// ── Router and events ───────────────────────────────────────────────────────
function route() {
  const [requested, id] = location.hash.slice(1).split('/');
  const view = Object.hasOwn(titles, requested) ? requested : 'overview';
  if (view === 'bills' && id && rowFor(id)) selected = id;
  document.title = `${titles[view]} · Receipt Lab`;
  document.querySelectorAll('[data-view]').forEach((a) => {
    const on = a.dataset.view === view;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#main').innerHTML = ({ overview, bills, method, guide })[view]();
  const count = $('#nav-count');
  if (count) count.textContent = rowsT().length;
}

async function load() {
  try {
    const res = await fetch(`${BASE}data.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text());
    full = await res.json();
    applyMode();
    route();
  } catch (error) {
    $('#main').innerHTML = `<div class="empty"><h1>No saved run yet.</h1><p>${escape(error.message)}</p><p>Run <code>pnpm bench:eval</code>, then reload.</p></div>`;
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.dataset.bill) { selected = target.dataset.bill; history.replaceState(null, '', `#bills/${selected}`); route(); return; }
  if (target.dataset.filter) { filter = target.dataset.filter; route(); return; }
  if (target.dataset.mode) { mode = target.dataset.mode; try { localStorage.setItem('receipt-lab-reasoning', mode); } catch { /* works without storage */ } applyMode(); route(); return; }
  if (target.dataset.track) { track = target.dataset.track; try { localStorage.setItem('receipt-lab-track', track); } catch { /* works without storage */ } route(); return; }
  if (target.dataset.detail) { detailTab = target.dataset.detail; route(); return; }
  if (target.dataset.action === 'expand') { const d = $('#image-dialog'); $('img', d).src = `${BASE}dataset/${caseFor(selected).file}`; d.showModal(); return; }
  if (target.classList.contains('dialog-close')) { $('#image-dialog').close(); return; }
  if (target.dataset.copy) { try { await navigator.clipboard.writeText(commands[target.dataset.copy]); toast('Copied'); } catch { toast('Select the text to copy it'); } }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'bill-search') { search = event.target.value; $('.list').innerHTML = billList(); }
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'category-filter') { category = event.target.value; route(); }
});
$('#image-dialog').addEventListener('click', (event) => { if (event.target.id === 'image-dialog') event.target.close(); });
window.addEventListener('hashchange', () => data && route());
load();
