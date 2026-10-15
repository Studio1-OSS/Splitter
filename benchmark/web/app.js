const $ = (selector, parent = document) => parent.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name, className = '') => `<svg aria-hidden="true" class="${className}"><use href="/icons.svg#${name}"/></svg>`;
const badge = (label, kind = '', symbol = '') => `<span class="badge ${kind}">${symbol ? icon(symbol) : ''}${escape(label)}</span>`;
const fmt = new Intl.NumberFormat('en-US');
const money = (value, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const pct = (r) => (r && r.n ? `${(100 * r.k / r.n).toFixed(r.k === r.n || r.k === 0 ? 0 : 1)}%` : 'n/a');
const ci = (r) => (r && r.n ? `95% CI ${Math.round(100 * r.lo)}–${Math.round(100 * r.hi)}%` : '');
const MODEL_URL = 'https://tokenfactory.nebius.com/?modals=endpoint-details&model-id=nvidia/Nemotron-3.5-Super-VL';
const CATEGORY = { groceries: 'Groceries', party: 'Party', home: 'Home & rent', food: 'Food', travel: 'Travel' };
const titles = { overview: 'Benchmark', bills: 'Bills', method: 'Method', guide: 'Run it' };
let data, toastTimer;
let selected = null, filter = 'all', category = 'all', search = '', detailTab = 'split', loading = false;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
}

function theme(dark) {
  document.body.classList.toggle('dark', dark);
  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  $('#theme-toggle span').textContent = label;
  $('#theme-toggle').setAttribute('aria-label', label);
}
let storedTheme = null;
try { storedTheme = localStorage.getItem('receipt-lab-theme'); } catch { /* no storage */ }
theme(storedTheme ? storedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
$('#theme-toggle').addEventListener('click', () => {
  const dark = !document.body.classList.contains('dark');
  theme(dark);
  try { localStorage.setItem('receipt-lab-theme', dark ? 'dark' : 'light'); } catch { /* Theme works without storage. */ }
});

const caseFor = (id) => data.cases.find((c) => c.id === id);
const rowFor = (id) => data.rows.find((r) => r.id === id);
const S = () => data.summary;
const isIssue = (r) => !r.ok || !r.splitCorrect || !r.extractionCorrect || (r.flagged && !r.planted && r.extractionCorrect) || (r.planted && !r.flagged);
const rowStatus = (r) =>
  !r.ok ? badge('Run failed', 'warning', 'alert')
    : r.planted ? badge(r.flagged ? 'Error caught' : 'Error missed', r.flagged ? '' : 'warning', r.flagged ? 'shield' : 'alert')
      : !r.extractionCorrect ? badge(r.splitCorrect ? 'Misread, split ok' : 'Misread', 'warning', 'eye')
        : !r.splitCorrect ? badge('Wrong split', 'warning', 'alert')
          : badge('Correct', '', 'check');

function modelCard() {
  const p = data.price || {};
  const info = data.modelInfo || {};
  return `<article class="panel model-card"><div class="model-card-head"><div><div class="eyebrow">${icon('layers')} MODEL UNDER TEST</div><h2>${escape(data.model)}</h2></div><a class="button" href="${MODEL_URL}" target="_blank" rel="noreferrer">Token Factory ${icon('external')}</a></div><dl class="facts">
    <div><dt>Endpoint</dt><dd><code>${escape(data.baseURL)}</code></dd></div>
    <div><dt>Price</dt><dd>$${p.inPerM} / 1M in · $${p.outPerM} / 1M out</dd></div>
    <div><dt>Input</dt><dd>${escape(info.modality ?? 'text+image')} · ${info.contextLength ? `${fmt.format(info.contextLength)} context` : ''} · ${escape(info.quantization ?? '')}</dd></div>
    <div><dt>Run</dt><dd>${escape(new Date(data.date).toUTCString().slice(5, 22))} UTC · ${data.bills} bills · settings <code>${escape(data.settings)}</code></dd></div>
    <div><dt>Calls</dt><dd>bill read: JSON schema, reasoning off, temperature 0 · tools: native function calling, <code>tool_choice: ${escape(data.toolChoice)}</code></dd></div></dl></article>`;
}

function metrics() {
  const o = S().overall;
  const cost = S().costUsd;
  const stats = [
    ['Split correct to the cent', pct(o.splitCorrect), 'shield', `<strong>${o.splitCorrect.k} of ${o.splitCorrect.n}</strong> bills · ${ci(o.splitCorrect)}`],
    ['Split computed by the model', pct(o.modelComputed), 'code', `its own <code>allocate_tax_tip</code> call, every bill`],
    ['Planted errors caught', `${o.plantedCaught.k}<small>/ ${o.plantedCaught.n}</small>`, 'eye', `wrong printed totals · false alarms <strong>${o.falseAlarms.k}</strong>`],
    ['Cost per bill', cost ? `$${cost.perBill.toFixed(4)}` : 'n/a', 'clock', cost ? `<strong>$${cost.per1000Bills.toFixed(2)}</strong> per 1,000 · p50 ${seconds(S().latencyMs.p50)}` : ''],
  ];
  return `<div class="metrics">${stats.map(([label, value, symbol, foot]) => `<article class="metric"><div class="metric-label">${label}${icon(symbol)}</div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></article>`).join('')}</div>`;
}

/** Horizontal bars with the Wilson interval drawn as a whisker. */
function bars(groups, key, label) {
  return `<div class="bars" role="table" aria-label="${escape(label)}">${Object.entries(groups).map(([name, b]) => {
    const r = b[key];
    const v = r.n ? r.k / r.n : 0;
    return `<div class="bar-row" role="row"><span class="bar-name" role="cell">${escape(CATEGORY[name] ?? name)}</span><span class="bar-track" role="cell" aria-label="${pct(r)}, ${ci(r)}"><span class="bar-fill" style="width:${v * 100}%"></span><span class="bar-ci" style="left:${r.lo * 100}%;width:${(r.hi - r.lo) * 100}%"></span></span><span class="bar-value" role="cell">${pct(r)}<small>${r.k}/${r.n}</small></span></div>`;
  }).join('')}</div>`;
}

function breakdown(groups, title) {
  const rows = Object.entries(groups);
  return `<div class="table-scroll"><table class="compact"><caption class="sr-only">${escape(title)}</caption><thead><tr><th>${escape(title)}</th><th>Bills</th><th>Read completely</th><th>Split correct</th><th>Planted caught</th></tr></thead><tbody>${rows.map(([k, b]) => `<tr><td>${escape(CATEGORY[k] ?? k)}</td><td>${b.bills}</td><td>${pct(b.extractionCorrect)}</td><td>${pct(b.splitCorrect)}</td><td>${b.plantedCaught.k}/${b.plantedCaught.n}</td></tr>`).join('')}</tbody></table></div>`;
}

function failures() {
  const rows = data.rows.filter(isIssue);
  if (!rows.length) return '<div class="empty-state">No failures in this run.</div>';
  return `<div class="failure-grid">${rows.map((r) => {
    const c = caseFor(r.id);
    const why = !r.extractionCorrect ? 'The model misread the bill.' + (r.flagged ? ' check_receipt flagged it.' : ' Nothing flagged it.') : !r.splitCorrect ? 'Read correctly, but a line went to the wrong people.' : r.planted && !r.flagged ? 'The planted total slipped through.' : 'Flag on a correct bill.';
    return `<a class="failure-card" href="#bills/${escape(r.id)}"><img src="/dataset/${escape(c.file)}" alt="" loading="lazy"><div><span class="row-id">${escape(r.id)}</span><strong>${escape(c.truth.merchant)}</strong><p>${escape(why)}</p><span class="merchant-meta">${escape(c.layout)} · ${escape(c.condition)} · ${escape(c.currency)}</span></div></a>`;
  }).join('')}</div>`;
}

function overview() {
  const o = S().overall;
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">${icon('book')} SPLITTER BENCHMARK · RECEIPT LAB</div><h1>Read the bill.<br>Do the maths <em>with tools.</em></h1><p>${escape(data.model)} reads ${data.bills} synthetic bills, decides who had what from a plain-English note, and calls calculator tools for every number. The app only checks the answer.</p><div class="button-row"><a class="button primary" href="#bills">Explore the bills ${icon('arrow')}</a><a class="text-link" href="#method">How it was measured ${icon('arrow')}</a></div></div><div class="hero-art" aria-hidden="true"><img class="receipt-stack back" src="/dataset/home-01.png" alt=""><img class="receipt-stack" src="/dataset/food-03.png" alt=""><span class="art-label first">${icon('eye')}${pct(o.linesPriced)} of lines read exactly</span><span class="art-label last">${icon('shield')}${o.plantedCaught.k}/${o.plantedCaught.n} wrong totals caught</span><span class="art-caption">real model runs · synthetic bills · exact maths</span></div></section>
  ${modelCard()}${metrics()}
  <section class="chart-grid"><article class="panel"><div class="panel-head"><div><h2>Correct splits, by category</h2><p>30 bills each · bar = result, band = 95% confidence interval</p></div></div>${bars(S().byCategory, 'splitCorrect', 'Split correct by category')}</article><article class="panel"><div class="panel-head"><div><h2>Reading vs reasoning</h2><p>Where the remaining errors come from</p></div></div><ul class="check-list">
    <li>${icon('eye')}<span>Bill read completely</span><strong>${pct(o.extractionCorrect)} <small>${o.extractionCorrect.k}/${o.extractionCorrect.n}</small></strong></li>
    <li>${icon('workflow')}<span>Split right when the bill was read right</span><strong>${pct(o.splitCorrectGivenRead)} <small>${o.splitCorrectGivenRead.k}/${o.splitCorrectGivenRead.n}</small></strong></li>
    <li>${icon('shield')}<span>Misreads flagged by <code>check_receipt</code></span><strong>${o.misreadsFlagged.k}/${o.misreadsFlagged.n}</strong></li>
    <li>${icon('alert')}<span>False alarms on correctly read bills</span><strong>${o.falseAlarms.k}/${o.falseAlarms.n}</strong></li>
    <li>${icon('check')}<span>App validation rule passed</span><strong>${pct(o.validationOk)}</strong></li></ul><div class="panel-note">Tokens per bill: ${fmt.format(S().tokens.perBillIn)} in / ${fmt.format(S().tokens.perBillOut)} out · ${S().retries} network retries · total cost $${S().costUsd?.total.toFixed(3) ?? 'n/a'}</div></article></section>
  <section class="chart-grid"><article class="panel"><div class="panel-head"><div><h2>By layout</h2><p>Thermal receipts, A4 invoices, phone screenshots</p></div></div>${breakdown(S().byLayout, 'Layout')}</article><article class="panel"><div class="panel-head"><div><h2>By photo condition</h2><p>Clean, faded, rotated, long (9–12 lines)</p></div></div>${breakdown(S().byCondition, 'Condition')}</article></section>
  <div class="section-head"><div><h2>Every miss, in the open</h2><p>Open one to see the image, what the model read, its tool calls and its split.</p></div><a href="#bills" class="text-link">All ${data.rows.length} bills ${icon('arrow')}</a></div>${failures()}
  <p class="evaluation-note"><strong>An application-level evaluation on synthetic bills, not an official benchmark.</strong> Real photos (glare, folds, handwriting) and ambiguous notes are harder. Run it on your own bills before relying on it.</p>`;
}

function matches(row) {
  const c = caseFor(row.id);
  const text = `${row.id} ${row.layout} ${row.condition} ${c?.truth.merchant ?? ''} ${row.currency}`.toLowerCase();
  const byFilter = filter === 'all' || (filter === 'issues' && isIssue(row)) || (filter === 'planted' && row.planted) || (filter === 'clean' && !row.planted);
  return text.includes(search.toLowerCase()) && byFilter && (category === 'all' || row.category === category);
}

function billList() {
  const rows = data.rows.filter(matches);
  return `<div class="table-scroll"><table><caption class="sr-only">Benchmark bills. Select one to inspect it.</caption><thead><tr><th>Bill</th><th>Result</th><th>Time</th></tr></thead><tbody>${rows.map((r) => {
    const c = caseFor(r.id);
    return `<tr class="${r.id === selected ? 'selected' : ''}"><td><button data-bill="${escape(r.id)}" aria-pressed="${r.id === selected}"><span class="row-id">${escape(r.id)}</span><span><span class="row-merchant">${escape(c?.truth.merchant ?? r.id)}</span><span class="merchant-meta">${escape(r.layout)} · ${escape(r.condition)} · ${escape(r.currency)} · ${r.linesTotal} lines · ${r.people} people</span></span></button></td><td>${rowStatus(r)}</td><td>${seconds(r.ms)}</td></tr>`;
  }).join('')}</tbody></table>${!rows.length ? `<div class="empty-state">${icon('search')}No matching bills.</div>` : ''}</div><div class="table-footer"><span>${rows.length} of ${data.rows.length} bills</span></div>`;
}

function splitCompare(c, r) {
  const names = c.people;
  const max = Math.max(1, ...names.map((n) => Math.max(r.expected?.[n] ?? 0, r.modelSplit?.[n] ?? 0)));
  return `<div class="note-label">THE NOTE</div><p class="assignment-note">${escape(c.note)}</p><div class="note-label">MODEL'S SPLIT (ITS OWN TOOL CALL) VS EXPECTED</div><div class="table-scroll"><table class="compact"><thead><tr><th>Person</th><th>Model</th><th>Expected</th><th></th></tr></thead><tbody>${names.map((n) => {
    const m = r.modelSplit?.[n] ?? 0, e = r.expected?.[n] ?? 0, same = Math.abs(m - e) < 0.005;
    return `<tr><td>${escape(n)}</td><td class="num">${money(m, c.currency)}</td><td class="num">${money(e, c.currency)}</td><td>${same ? icon('check') : icon('alert', 'failed')}</td></tr>`;
  }).join('')}</tbody></table></div><div class="split-track wide" aria-hidden="true">${names.map((n) => `<span style="width:${(r.modelSplit?.[n] ?? 0) / max * 25}%" title="${escape(n)}"></span>`).join('')}</div>${r.explanation ? `<p class="expected-warning">Model: “${escape(r.explanation)}”</p>` : ''}`;
}

function readCompare(c, r) {
  const read = r.extracted?.items ?? [];
  const rows = c.truth.items.map((t, i) => {
    const hit = read.find((x) => Math.abs(x.totalPrice - t.totalPrice) < 0.005);
    return `<tr><td>${i + 1}</td><td>${escape(t.name)}</td><td class="num">${money(t.totalPrice, c.currency)}</td><td class="num ${hit ? '' : 'failed'}">${hit ? money(hit.totalPrice, c.currency) : 'not read'}</td></tr>`;
  }).join('');
  const charge = (label, truth, got) => `<tr><td></td><td>${label}</td><td class="num">${truth == null ? '–' : money(truth, c.currency)}</td><td class="num ${(truth ?? 0) === (got ?? 0) || Math.abs((truth ?? 0) - (got ?? 0)) < 0.005 ? '' : 'failed'}">${got == null ? '–' : money(got, c.currency)}</td></tr>`;
  const t = c.truth, x = r.extracted ?? {};
  return `<div class="note-label">WHAT THE MODEL READ VS THE TRUTH</div><div class="table-scroll"><table class="compact"><thead><tr><th>#</th><th>Line</th><th>Truth</th><th>Read</th></tr></thead><tbody>${rows}${charge('Tax', t.tax, x.tax)}${charge('Tip', t.tip, x.tip)}${charge('Service charge', t.serviceCharge, x.serviceCharge)}${charge('Discount', t.discount, x.discount)}${charge('<strong>Printed total</strong>', t.total, x.total)}</tbody></table></div>${c.planted ? `<p class="expected-warning">Planted error: the printed total is wrong on purpose. Lines and charges come to ${money(t.correctTotal, c.currency)}.</p>` : ''}`;
}

function traceView(r) {
  if (!r.trace?.length) return '<div class="empty-state">No tool calls recorded.</div>';
  return `<div class="note-label">TOOL CALLS, IN ORDER</div><ol class="timeline">${r.trace.map((t) => `<li class="${t.ok ? '' : 'flagged'}"><span class="dot">${icon(t.ok ? 'check' : 'alert')}</span><div><p><code>${escape(t.tool)}</code> <span class="by ${t.by}">${escape(t.by)}</span> <span class="merchant-meta">${t.ms}ms</span></p><details><summary>arguments → result</summary><pre>${escape(JSON.stringify(t.args, null, 1))}\n→ ${escape(JSON.stringify(t.result, null, 1))}</pre></details></div></li>`).join('')}</ol><p class="expected-warning">${r.calls?.length ?? 0} model calls · ${fmt.format(r.tokensIn)} in + ${fmt.format(r.tokensOut)} out tokens · $${r.costUsd?.toFixed(5) ?? 'n/a'} · “model” = the model chose the call; “app” = the app's validation rule.</p>`;
}

function billDetail() {
  const c = caseFor(selected), r = rowFor(selected);
  if (!c || !r) return '<div class="empty-state">Select a bill to inspect.</div>';
  const tabs = [['split', 'Split'], ['read', 'Read'], ['trace', 'Tool calls']];
  return `<div class="detail-heading"><div class="eyebrow">${escape(c.id)} · ${escape(CATEGORY[c.category])} · ${escape(c.layout)} · ${escape(c.condition)}</div><h2>${escape(c.truth.merchant)}</h2><div class="legend">${rowStatus(r)}<span>${c.people.length} people</span><span>${seconds(r.ms)}</span><span>${escape(c.currency)}</span></div></div><div class="receipt-preview"><img src="/dataset/${escape(c.file)}" alt="Synthetic ${escape(c.truth.merchant)} bill ${escape(c.id)}"><button class="icon-button expand-receipt" data-action="expand" aria-label="Expand bill ${escape(c.id)}">${icon('expand')}</button></div><div class="detail-body"><div class="filter-tabs" aria-label="Bill detail sections">${tabs.map(([tab, label]) => `<button data-detail="${tab}" aria-pressed="${detailTab === tab}" class="${detailTab === tab ? 'active' : ''}">${label}</button>`).join('')}</div><div>${detailTab === 'trace' ? traceView(r) : detailTab === 'read' ? readCompare(c, r) : splitCompare(c, r)}</div></div>`;
}

function bills() {
  if (!selected || !rowFor(selected)) selected = (data.rows.find(isIssue) ?? data.rows[0]).id;
  const issues = data.rows.filter(isIssue).length;
  return `<div class="page-intro"><div class="eyebrow">${icon('database')} ${data.rows.length} BILLS, ALL OPEN</div><h1>Every bill. Every tool call.</h1><p>Pick a bill to compare what the model read with the truth, follow its tool calls, and check its split against the expected one.</p></div><div class="explorer-toolbar"><div class="filter-tabs" aria-label="Filter bills">${[['all', `All ${data.rows.length}`], ['issues', `Misses ${issues}`], ['planted', 'Planted errors'], ['clean', 'Correct bills']].map(([key, label]) => `<button data-filter="${key}" class="${filter === key ? 'active' : ''}" aria-pressed="${filter === key}">${label}</button>`).join('')}</div><label class="select">${icon('layers')}<select id="category-filter" aria-label="Category"><option value="all">All categories</option>${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}" ${category === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="search">${icon('search')}<input type="search" id="bill-search" placeholder="Search bills…" aria-label="Search bill ID, merchant, layout or currency" value="${escape(search)}"></label></div><div class="explorer-grid"><section class="panel explorer-list" aria-label="Bill list">${billList()}</section><section class="panel explorer-detail" aria-label="Selected bill">${billDetail()}</section></div>`;
}

function method() {
  return `<div class="page-intro"><div class="eyebrow">${icon('workflow')} THE RECIPE AND THE METHOD</div><h1>The model reasons.<br>Tools do the maths.</h1><p>Every split in this benchmark is the model's own calculator-tool result. The app adds one validation rule and scores the answer against ground truth.</p></div>
  <div class="pipeline">${[['eye', '01', 'See', 'Vision → bill JSON (lines, tax, tip, fees, total)'], ['workflow', '02', 'Reason', 'Note → who had each line'], ['code', '03', 'Calculate', 'check_receipt, allocate_tax_tip, validate_total'], ['shield', '04', 'Check', 'App rule: shares = lines + charges']].map(([s, n, t, d]) => `<div class="pipeline-card"><span class="step-icon">${icon(s)}</span><div><h3>${t}</h3><p>${d}</p></div><span class="step-number">${n}</span></div>`).join('')}</div>
  <div class="workflow-grid">
  <article class="panel workflow-card"><h2>Dataset</h2><p>150 synthetic bills: 30 each of groceries, party, home & rent, food and travel. In every category: 10 INR / 10 USD / 10 EUR; 12 clean, 6 faded, 6 rotated, 6 long (9–12 lines); 6 planted wrong totals (20%); groups of 2–5 people. Merchants and lines fit the category (a landlord bills rent, a cab company bills fares). Generated with a fixed seed and rendered in Chrome, so anyone can rebuild the exact set.</p></article>
  <article class="panel workflow-card"><h2>Ground truth</h2><p>Every line, charge and printed total, who had what, and the expected split from Splitter's integer money engine (largest-remainder rounding, ties by group order). The note the model reads is written from the same truth.</p></article>
  <article class="panel workflow-card"><h2>What is scored</h2>${[['Read', 'Every line price, tax, tip, service charge, discount and printed total read exactly.'], ['Split', "The model's own allocate_tax_tip shares equal the expected split to the cent. No tool call = wrong."], ['Planted errors', 'Caught when check_receipt fails and the model reports the problem.'], ['False alarms', 'A flag on a correct bill that was read correctly. A flag after a misread counts as a catch.'], ['Cost', 'Tokens × live price from GET /v1/models?verbose=true.']].map(([n, d]) => `<div class="tool-row"><code>${n}</code><p>${d}</p></div>`).join('')}</article>
  <article class="panel workflow-card"><h2>Honest reporting</h2><p>Failed runs count as failures. Network errors (HTTP 429/5xx, timeouts) are retried up to 3 times and the count is reported; nothing else is retried. Rates come with Wilson 95% intervals. A settings fingerprint (model, endpoint, prompts, tools) marks which runs are comparable. A second full run agreed with this one on 148 of 150 bills.</p></article>
  </div>
  <article class="panel limitation"><h2>Limits</h2><p>Synthetic bills are cleaner than real photos. Misreads cluster on A4 invoices, especially rotated ones. The calculator tools check arithmetic, not intent: a line given to the wrong person still adds up, so people should review assignments. This lab tests image understanding, reasoning and tool calls only.</p></article>`;
}

const commands = {
  setup: 'git clone https://github.com/Studio1-OSS/Splitter\ncd Splitter && pnpm install\ncp .env.example .env   # add NEBIUS_API_KEY',
  ui: 'pnpm bench:dev\n# http://localhost:3001',
  agent: ['pnpm bench:agent benchmark/dataset/party-01.png \\', '  "Everyone shared the DJ booking 3h, Priya had the Sparkling wine x2, everyone shared the Birthday cake 2kg." \\', '  Aman,Priya'].join('\n'),
  eval: 'pnpm bench:eval                  # all 150 bills (about $0.50)\npnpm bench:eval --limit 10 --concurrency 2\npnpm bench:eval --category travel',
  dataset: 'pnpm bench:dataset              # rebuild the 150 bills (needs Chrome)',
};
const codeBlock = (key) => `<div class="code-block"><pre><code>${escape(commands[key])}</code></pre><button class="copy-button" data-copy="${key}" aria-label="Copy ${key} commands">${icon('copy')}</button></div>`;

function guide() {
  const files = ['benchmark/receipt-agent.mts  the agent: see → reason → calculate', 'benchmark/eval.mts           benchmark runner + scoring', 'benchmark/stats.mts          live prices, Wilson intervals', 'benchmark/dataset/           150 bills + cases.json (truth)', 'benchmark/server.mts         this local dashboard', 'src/server/ai/tools.ts      the calculator tools', 'src/server/ai/nebius.ts     model adapter + tool loop'].join('\n');
  return `<div class="page-intro"><div class="eyebrow">${icon('terminal')} YOUR KEY. YOUR BILLS. YOUR RESULTS.</div><h1>Run it yourself.</h1><p>The benchmark lives in the Splitter repo and reuses the app's own code: the same model adapter, bill schema and calculator tools.</p></div><div class="guide-layout"><div class="guide-steps">
  <article class="panel guide-step"><h2>Set up</h2><p>Node.js 20+ and pnpm. Add a Nebius Token Factory key to <code>.env</code>.</p>${codeBlock('setup')}</article>
  <article class="panel guide-step"><h2>Run one bill</h2><p>Prints what the model read, each tool call, its split and the validation result.</p>${codeBlock('agent')}<div class="cost-note">Real model calls on your key: about $0.003 per bill.</div></article>
  <article class="panel guide-step"><h2>Run the benchmark</h2><p>Writes <code>benchmark/results.json</code> and <code>results.md</code>. Reload this page to see them.</p>${codeBlock('eval')}</article>
  <article class="panel guide-step"><h2>Open this lab</h2><p>Reads saved results only; it makes no model calls and needs no key.</p>${codeBlock('ui')}${codeBlock('dataset')}</article>
  </div><aside class="panel guide-aside"><span class="step-icon" style="margin-bottom:17px">${icon('book')}</span><h3>What's where</h3><pre class="file-tree">${files}</pre><a href="https://github.com/Studio1-OSS/Splitter" class="text-link" target="_blank" rel="noreferrer">Splitter on GitHub ${icon('external')}</a><a href="${MODEL_URL}" class="text-link" target="_blank" rel="noreferrer">The model on Token Factory ${icon('external')}</a><div style="border-top:1px solid var(--line);padding-top:15px;margin-top:13px"><a class="button" href="/results.json" download>${icon('download')}Download results.json</a></div></aside></div>`;
}

function route() {
  const [requested, id] = location.hash.slice(1).split('/');
  const view = Object.hasOwn(titles, requested) ? requested : 'overview';
  if (view === 'bills' && id && rowFor(id)) selected = id;
  $('#page-name').textContent = titles[view];
  document.title = `${titles[view]} · Receipt Lab`;
  document.querySelectorAll('[data-view]').forEach((link) => {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('#main').innerHTML = ({ overview, bills, method, guide })[view]();
  const count = $('#nav-count');
  if (count) count.textContent = data.rows.length;
}

async function load() {
  loading = true;
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text());
    data = await res.json();
    route();
  } catch (error) {
    $('#main').innerHTML = `<div class="empty-state"><h1>No saved run yet.</h1><p>${escape(error.message)}</p><p>Run <code>pnpm bench:eval</code>, then reload.</p></div>`;
  } finally {
    loading = false;
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.dataset.bill) { selected = target.dataset.bill; history.replaceState(null, '', `#bills/${selected}`); route(); return; }
  if (target.dataset.filter) { filter = target.dataset.filter; route(); return; }
  if (target.dataset.detail) { detailTab = target.dataset.detail; route(); return; }
  if (target.dataset.action === 'expand') {
    const dialog = $('#image-dialog');
    $('img', dialog).src = `/dataset/${caseFor(selected).file}`;
    dialog.showModal();
    return;
  }
  if (target.classList.contains('dialog-close')) { $('#image-dialog').close(); return; }
  if (target.dataset.copy) {
    try { await navigator.clipboard.writeText(commands[target.dataset.copy]); toast('Copied'); } catch { toast('Select the text to copy it'); }
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'bill-search') {
    search = event.target.value;
    $('.explorer-list').innerHTML = billList();
  }
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'category-filter') { category = event.target.value; route(); }
});
$('#image-dialog').addEventListener('click', (event) => { if (event.target.id === 'image-dialog') event.target.close(); });
window.addEventListener('hashchange', () => data && route());
load();
