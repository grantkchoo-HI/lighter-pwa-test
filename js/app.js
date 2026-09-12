import { loadData, saveData, clearData } from "./storage.js";
import { defaultData, addDebt, updateDebt, recordPayment, recordHealthyBehaviors, totalDebt, originalDebt, minimums, progress, reclaimedMonthly, snapshot } from "./state.js";
import { calculatePayoff, compareStrategies, addMonths } from "./engine.js";
import { STRATEGIES, firstTarget } from "./strategies.js";
import { validateBackup, downloadBackup } from "./backup.js";
import { money, percent, dateLabel, fullDate, monthsLabel, escapeHtml, todayISO } from "./format.js";

let data;
let activeRoute = location.hash.slice(1) || "home";
let whatIfExtra = null;
let toastTimer;
const dialog = document.querySelector("#appDialog");
const dialogContent = document.querySelector("#dialogContent");
const screenNames = new Set(["home", "debts", "plan", "whatif", "journey", "settings"]);
const debtTypes = new Set(["Credit Card", "Personal Loan", "Auto Loan", "Medical Debt", "Student Loan", "Buy Now Pay Later", "Other"]);
const boundedMoney = (value, max = 100_000_000) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(0, number)) : 0;
};

function options(overrides = {}) {
  const currentMonth = todayISO().slice(0, 7);
  const override = data.plan.overrideMonth === currentMonth ? data.plan.currentMonthExtraOverride : null;
  return {
    strategy: data.plan.strategy,
    extraMonthlyPayment: data.plan.extraMonthlyPayment,
    firstMonthExtra: override,
    customOrder: data.plan.customOrder,
    hybridThreshold: data.plan.hybridThreshold,
    ...overrides
  };
}

function activeDebts() { return data.debts.filter(d => d.status !== "deleted" && Number(d.currentBalance) > 0); }
function projection(overrides = {}) { return calculatePayoff(data.debts.filter(d => d.status !== "deleted"), options(overrides)); }
function currency() { return data.settings.currency || "USD"; }
function currentTarget(strategy = data.plan.strategy) { return firstTarget(activeDebts(), strategy, options({ strategy })); }
function payoffDate(result) { return result.paidOff ? dateLabel(addMonths(new Date(), result.months)) : "Needs a larger payment"; }
function strategyName(key) { return STRATEGIES[key]?.name || key; }

async function persist(message) {
  try { await saveData(data); if (message) showToast(message); }
  catch (error) { showToast(error.message, true); throw error; }
}

function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function showDialog(html) {
  dialogContent.innerHTML = html;
  dialog.showModal();
  requestAnimationFrame(() => dialogContent.querySelector("input, select, button")?.focus());
}
function closeDialog() { dialog.close(); }
const closeButton = `<button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">✕</button>`;

function totalPaid() { return Math.max(0, originalDebt(data) - totalDebt(data)); }
function baselineProjection() { return projection({ extraMonthlyPayment: 0, firstMonthExtra: null }); }
function interestSaved() {
  const baseline = baselineProjection(), current = projection();
  return baseline.paidOff && current.paidOff ? Math.max(0, baseline.totalInterest - current.totalInterest) : 0;
}

function progressBar(value, label = "Overall payoff progress") {
  const safe = Math.max(0, Math.min(100, value));
  return `<progress class="progress-track" aria-label="${label}" max="100" value="${safe.toFixed(2)}"></progress><div class="progress-label"><span>${percent(safe)} complete</span><span>${percent(100-safe)} remaining</span></div>`;
}

function wall(value) {
  const cleared = Math.round(Math.max(0, Math.min(100, value)) / 5);
  return `<div class="wall" role="img" aria-label="Breaking wall: ${percent(value)} cleared">${Array.from({length:20}, (_, i) => `<span class="brick ${i < cleared ? "cleared" : ""}"></span>`).join("")}</div>`;
}

function nextMilestone() {
  const paid = totalPaid(), original = originalDebt(data), candidates = [100, 500, 1000, original * .1, original * .25, original * .5, original * .75].filter(v => v > paid + .01).sort((a,b) => a-b);
  return candidates[0] ? { amount: candidates[0] - paid, target: candidates[0] } : null;
}

function renderHome() {
  const root = document.querySelector("#screen-home");
  if (!data.debts.length) {
    root.innerHTML = `<div class="hero"><p class="eyebrow">A calmer payoff plan</p><h1 id="home-title">Let's make this manageable.</h1><p>Start by adding the debt you want to tackle. Your information stays on this device.</p></div><div class="card empty"><div class="empty-visual" aria-hidden="true">↘</div><h2>One clear step at a time</h2><p>Add a balance, APR, and minimum payment to see your first payoff estimate.</p><button class="primary" data-action="add-debt">Add My First Debt</button><button class="ghost" data-action="load-demo">Load Demo Data</button></div>`;
    return;
  }
  const total = totalDebt(data), original = originalDebt(data), pct = progress(data), plan = projection(), target = currentTarget(), milestone = nextMilestone(), reclaimed = reclaimedMonthly(data);
  if (total === 0) { root.innerHTML = renderDebtFree(); return; }
  const targetPlanMonth = plan.schedule[0];
  const targetPayment = targetPlanMonth?.payments[target?.id] || target?.minimumPayment || 0;
  root.innerHTML = `
    <div class="hero"><p class="eyebrow">Total debt remaining</p><h1 id="home-title" class="hero-value money">${money(total,currency())}</h1><p>${money(totalPaid(),currency())} of ${money(original,currency())} cleared</p>${data.settings.theme === "wall" ? wall(pct) : ""}${progressBar(pct)}</div>
    <div class="stats card">
      <div class="stat"><span>Debt-free estimate</span><strong>${payoffDate(plan)}</strong></div>
      <div class="stat"><span>Monthly minimums</span><strong>${money(minimums(data),currency())}</strong></div>
      <div class="stat"><span>Planned extra</span><strong>${money(data.plan.extraMonthlyPayment,currency())}</strong></div>
      <div class="stat"><span>Strategy</span><strong>${strategyName(data.plan.strategy).replace("Debt ","")}</strong></div>
    </div>
    <div class="grid two spaced">
      <article class="card">
        <p class="eyebrow">Current mission</p><h2>${escapeHtml(target?.name || "Plan complete")}</h2>
        <div class="debt-head"><div><span class="debt-type">Current balance</span><div class="balance money">${money(target?.currentBalance,currency())}</div></div><span class="chip target">Next target</span></div>
        <div class="stats"><div class="stat"><span>Planned this month</span><strong>${money(targetPayment,currency())}</strong></div><div class="stat"><span>Minimum</span><strong>${money(target?.minimumPayment,currency())}</strong></div></div>
        ${progressBar(target?.originalBalance ? (1-target.currentBalance/target.originalBalance)*100 : 0, `${escapeHtml(target?.name)} progress`)}
        <div class="button-row spaced"><button class="primary" data-action="mission">Record Payments</button><button class="ghost" data-action="life-happened">Life Happened</button></div>
      </article>
      <div class="grid">
        <article class="card"><p class="eyebrow">Next major milestone</p><h2>${milestone ? `${money(milestone.amount,currency())} to go` : "Final payoff ahead"}</h2><p>${milestone ? `Reach ${money(milestone.target,currency())} in principal eliminated.` : "One payment at a time."}</p></article>
        <article class="card celebration-card"><p class="eyebrow">Money reclaimed</p><h2 class="balance">${money(reclaimed,currency())}/month</h2><p>${reclaimed ? `${money(reclaimed*12,currency())} in annual cash flow from eliminated minimums.` : "Paid-off minimums will appear here."}</p></article>
      </div>
    </div>`;
}

function renderDebtFree() {
  const reclaimed = reclaimedMonthly(data);
  return `<div class="hero onboarding"><p class="eyebrow">Journey complete</p><h1 id="home-title">Debt free</h1><div class="hero-value">${money(originalDebt(data),currency())}</div><p>Debt eliminated. You built this one payment at a time.</p></div><div class="grid two"><div class="card"><h2>Your journey</h2><div class="stats"><div class="stat"><span>Payments recorded</span><strong>${data.payments.length}</strong></div><div class="stat"><span>Monthly reclaimed</span><strong>${money(reclaimed,currency())}</strong></div><div class="stat"><span>Annual cash flow</span><strong>${money(reclaimed*12,currency())}</strong></div><div class="stat"><span>Interest saved est.</span><strong>${money(interestSaved(),currency())}</strong></div></div></div><div class="card"><h2>What could reclaimed money do next?</h2><div class="chips"><span class="chip">Emergency fund · future</span><span class="chip">Investing · future</span><span class="chip">Home · future</span><span class="chip">Custom goal · future</span></div><p class="fine-print">Reclaimed cash flow assumes you do not take on replacement debt.</p></div></div>`;
}

function debtCard(debt) {
  const paid = debt.originalBalance ? Math.max(0, (1 - debt.currentBalance / debt.originalBalance) * 100) : 0;
  const utilization = debt.creditLimit ? debt.currentBalance / debt.creditLimit * 100 : null;
  return `<article class="card debt-card"><div class="debt-head"><div><p class="debt-type">${escapeHtml(debt.type)}</p><h2>${escapeHtml(debt.name)}</h2></div><div class="align-right"><span class="debt-type">Balance</span><div class="balance money">${money(debt.currentBalance,currency())}</div></div></div>${progressBar(paid, `${escapeHtml(debt.name)} payoff progress`)}<div class="chips"><span class="chip">${debt.apr}% APR</span><span class="chip">${money(debt.minimumPayment,currency())} minimum</span>${utilization != null ? `<span class="chip">${percent(utilization,1)} utilization</span>`:""}${debt.dueDate ? `<span class="chip">Due day ${debt.dueDate}</span>`:""}</div><div class="button-row"><button class="secondary" data-action="record-payment" data-id="${debt.id}" ${debt.currentBalance <= 0 ? "disabled":""}>Record payment</button><button class="ghost" data-action="debt-detail" data-id="${debt.id}">View details</button></div></article>`;
}

function renderDebts() {
  const root = document.querySelector("#screen-debts");
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow">Your accounts</p><h1 id="debts-title">Debts</h1><p>${data.debts.length} tracked · ${money(totalDebt(data),currency())} remaining</p></div><button class="primary" data-action="add-debt">Add debt</button></div>${data.debts.length ? `<div class="grid two">${data.debts.map(debtCard).join("")}</div>` : `<div class="card empty"><h2>No debts added yet</h2><p>Add one to build your payoff plan.</p><button class="primary" data-action="add-debt">Add debt</button></div>`}`;
}

function renderPlan() {
  const root = document.querySelector("#screen-plan");
  if (!data.debts.length) { root.innerHTML = emptyFor("plan-title", "Plan", "Add a debt to compare payoff strategies."); return; }
  const comparisons = compareStrategies(data.debts, options());
  const minInterest = Math.min(...comparisons.filter(r => r.paidOff).map(r => r.totalInterest));
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow">Strategy lab</p><h1 id="plan-title">Choose your path</h1><p>Each method can work. Choose the one you can sustain.</p></div></div><div class="compare">${comparisons.map(result => {
    const target = currentTarget(result.strategy);
    return `<article class="card strategy ${data.plan.strategy===result.strategy?"selected":""}">${data.plan.strategy===result.strategy?`<span class="chip selected-label">Current plan</span>`:""}<h2>${strategyName(result.strategy)}</h2><p>${STRATEGIES[result.strategy].description}</p><div class="stats"><div class="stat"><span>Debt free</span><strong>${result.paidOff ? monthsLabel(result.months) : "Payment too low"}</strong></div><div class="stat"><span>Est. interest</span><strong>${result.paidOff ? money(result.totalInterest,currency()) : "—"}</strong></div><div class="stat"><span>Difference</span><strong>${result.paidOff ? `+${money(result.totalInterest-minInterest,currency())}` : "—"}</strong></div><div class="stat"><span>First target</span><strong>${escapeHtml(target?.name || "—")}</strong></div></div><div class="button-row"><button class="${data.plan.strategy===result.strategy?"secondary":"primary"}" data-action="use-strategy" data-strategy="${result.strategy}">${data.plan.strategy===result.strategy?"Using This Strategy":"Use This Strategy"}</button>${result.strategy==="custom"?`<button class="ghost" data-action="custom-order">Set order</button>`:""}</div></article>`;
  }).join("")}</div><p class="fine-print">Estimates apply APR ÷ 12 monthly, then fixed minimums and extra payment. Lender calculations, fees, and variable minimums can differ.</p>`;
}

function renderWhatIf() {
  const root = document.querySelector("#screen-whatif");
  if (!data.debts.length) { root.innerHTML = emptyFor("whatif-title", "What If?", "Add a debt to explore payment changes."); return; }
  if (whatIfExtra == null) whatIfExtra = Number(data.plan.extraMonthlyPayment);
  const current = projection(), simulated = projection({ extraMonthlyPayment: whatIfExtra, firstMonthExtra: null });
  const monthsSaved = current.paidOff && simulated.paidOff ? current.months - simulated.months : null;
  const interestDifference = current.paidOff && simulated.paidOff ? current.totalInterest - simulated.totalInterest : null;
  const aggressive = whatIfExtra > Math.max(1000, minimums(data) * 2);
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow">Private sandbox</p><h1 id="whatif-title">What If?</h1><p>Explore a different monthly extra. Nothing changes until you apply it.</p></div></div><div class="grid two"><div class="card"><label for="whatif-range">Extra monthly payment <strong id="whatif-display">${money(whatIfExtra,currency())}</strong><input id="whatif-range" type="range" min="0" max="2000" step="25" value="${whatIfExtra}"></label><label for="whatif-number">Enter an exact amount<input id="whatif-number" type="number" min="0" max="1000000" step="1" value="${whatIfExtra}" inputmode="decimal"></label><div class="chips">${[0,25,50,100,250,500].map(v=>`<button class="chip" data-action="whatif-preset" data-value="${v}">${money(v,currency())}</button>`).join("")}</div>${aggressive?`<p class="notice warning">This plan may leave very little room for unexpected expenses. Consider keeping some financial breathing room.</p>`:""}</div><div class="card"><p class="eyebrow">Simulation</p><h2>${payoffDate(simulated)}</h2><div class="stats"><div class="stat"><span>Months remaining</span><strong>${simulated.paidOff?simulated.months:"—"}</strong></div><div class="stat"><span>Interest remaining</span><strong>${simulated.paidOff?money(simulated.totalInterest,currency()):"—"}</strong></div><div class="stat"><span>Months saved</span><strong>${monthsSaved == null?"—":Math.max(0,monthsSaved)}</strong></div><div class="stat"><span>Interest saved</span><strong>${interestDifference == null?"—":money(Math.max(0,interestDifference),currency())}</strong></div></div><button class="primary" data-action="apply-whatif" ${whatIfExtra===data.plan.extraMonthlyPayment?"disabled":""}>Use This Payment Plan</button></div></div><div class="card spaced"><h2>Current plan comparison</h2><div class="stats"><div class="stat"><span>Current extra</span><strong>${money(data.plan.extraMonthlyPayment,currency())}</strong></div><div class="stat"><span>Current debt-free</span><strong>${payoffDate(current)}</strong></div><div class="stat"><span>Simulated extra</span><strong>${money(whatIfExtra,currency())}</strong></div><div class="stat"><span>Simulated debt-free</span><strong>${payoffDate(simulated)}</strong></div></div></div>`;
}

function chartSVG() {
  let points = data.balanceHistory.map(item => ({ date: item.date, total: item.total }));
  if (!points.length) points = [{date:todayISO(), total:totalDebt(data)}];
  if (points.length === 1) points.unshift({date:data.createdAt?.slice(0,10)||todayISO(), total:originalDebt(data)});
  const width=600,height=210,pad=28,max=Math.max(...points.map(p=>p.total),1);
  const coords=points.map((p,i)=>({x:pad+(i/(points.length-1))*(width-pad*2),y:height-pad-(p.total/max)*(height-pad*2)}));
  const line=coords.map((p,i)=>`${i?"L":"M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area=`${line} L${coords.at(-1).x},${height-pad} L${coords[0].x},${height-pad} Z`;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Total debt over time"><defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74aa94" stop-opacity=".45"/><stop offset="1" stop-color="#74aa94" stop-opacity=".04"/></linearGradient></defs><line class="axis" x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}"/><path class="area" d="${area}"/><path class="line" d="${line}"/><text x="${pad}" y="${height-8}">${escapeHtml(fullDate(points[0].date))}</text><text text-anchor="end" x="${width-pad}" y="${height-8}">${escapeHtml(fullDate(points.at(-1).date))}</text><text x="${pad}" y="14">${escapeHtml(money(max,currency()))}</text></svg>`;
}

function renderJourney() {
  const root = document.querySelector("#screen-journey");
  if (!data.debts.length) { root.innerHTML = emptyFor("journey-title", "Journey", "Your payments and milestones will form a clear history here."); return; }
  const payments = [...data.payments].sort((a,b)=>b.date.localeCompare(a.date));
  const milestones = [...data.milestones].sort((a,b)=>b.achievedAt.localeCompare(a.achievedAt));
  const reclaimed = reclaimedMonthly(data);
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow">Your progress</p><h1 id="journey-title">Journey</h1><p>Progress is progress, at any pace.</p></div></div><div class="stats card"><div class="stat"><span>Starting debt</span><strong>${money(originalDebt(data),currency())}</strong></div><div class="stat"><span>Principal eliminated</span><strong>${money(totalPaid(),currency())}</strong></div><div class="stat"><span>Debts eliminated</span><strong>${data.debts.filter(d=>d.status==="paid").length}</strong></div><div class="stat"><span>Interest saved est.</span><strong>${money(interestSaved(),currency())}</strong></div></div><div class="card spaced"><h2>Debt over time</h2>${chartSVG()}${progressBar(progress(data))}</div><div class="grid two spaced"><div class="card"><h2>Money reclaimed</h2><div class="big-callout"><span>Monthly payments eliminated</span><strong>${money(reclaimed,currency())}/month</strong><span>${money(reclaimed*12,currency())}/year</span></div><p class="fine-print">This assumes you do not take on replacement debt.</p></div><div class="card"><h2>Milestones</h2>${milestones.length?`<ul class="timeline">${milestones.slice(0,8).map(m=>`<li><span class="timeline-dot"></span><div>${escapeHtml(m.label)}<small>${fullDate(m.achievedAt.slice(0,10))}</small></div></li>`).join("")}</ul>`:`<p>Your first milestone is waiting for your first recorded payment.</p>`}</div></div><div class="card spaced"><h2>Payment history</h2>${payments.length?`<ul class="timeline">${payments.map(p=>{const d=data.debts.find(x=>x.id===p.debtId);return `<li><span class="timeline-dot"></span><div><strong>${escapeHtml(d?.name||"Debt")}</strong><small>${fullDate(p.date)}${p.note?` · ${escapeHtml(p.note)}`:""}</small></div><strong>${money(p.amount,currency(),2)}</strong></li>`}).join("")}</ul>`:`<p>No payments recorded yet.</p>`}</div>`;
}

function renderSettings() {
  const root = document.querySelector("#screen-settings");
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow">Your preferences</p><h1 id="settings-title">Settings & data</h1><p>Your financial data stays in this browser.</p></div></div><div class="grid two"><div class="card"><h2>Plan settings</h2><label>Currency<select data-setting="currency">${["USD","CAD","EUR","GBP","AUD"].map(v=>`<option ${currency()===v?"selected":""}>${v}</option>`).join("")}</select></label><div class="setting-row"><div><strong>Monthly extra payment</strong><p>Added after required minimums.</p></div><input class="setting-number" data-setting="defaultExtraPayment" type="number" min="0" max="1000000" value="${data.plan.extraMonthlyPayment}" inputmode="decimal"></div><div class="setting-row"><div><strong>Hybrid threshold</strong><p>Small debts at or below this amount go first.</p></div><input class="setting-number" data-setting="hybridThreshold" type="number" min="0" max="1000000" value="${data.plan.hybridThreshold}" inputmode="decimal"></div><label>Payday preference<select data-setting="paydayPreference">${["Weekly","Every two weeks","Twice monthly","Monthly"].map(v=>`<option ${data.settings.paydayPreference===v?"selected":""}>${v}</option>`).join("")}</select></label></div><div class="card"><h2>Display</h2><label>Visual theme<select data-setting="theme"><option value="wall" ${data.settings.theme==="wall"?"selected":""}>Breaking Wall</option><option value="clean" ${data.settings.theme==="clean"?"selected":""}>Clean Progress</option></select></label><div class="setting-row"><div><strong>Reality View by default</strong><p>Show straightforward figures with minimal celebration.</p></div><input data-setting="realityView" type="checkbox" ${data.settings.realityView?"checked":""}></div><div class="setting-row"><div><strong>Notifications</strong><p>Reserved for a future version; this app does not request permission.</p></div><input type="checkbox" disabled></div></div><div class="card"><h2>Backup & privacy</h2><div class="notice"><strong>Backup files contain your financial data.</strong><p>They are created locally and only leave this device if you choose to save, copy, or share them.</p></div><p>Export a backup before clearing browser data or moving devices. Import reads the selected file locally and asks before replacing current data.</p><div class="button-row"><button class="primary" data-action="export">Export Backup</button><button class="secondary" data-action="import">Import Backup</button></div><hr class="privacy-divider"><div class="button-row"><button class="ghost" data-action="load-demo">Load Demo Data</button><button class="danger" data-action="reset">Delete All Local Data</button></div></div><div class="card"><h2>Privacy</h2><p>Your financial data stays on this device. Lighter does not require an account and does not upload your debts or payment history to a server.</p><p class="fine-print">The app stores its data in this browser's IndexedDB. Clearing browser data can remove it, so keep backups somewhere you trust.</p></div><div class="card"><h2>About Lighter</h2><p>Version 0.1 · Local-first</p><p class="fine-print">This app provides educational payoff calculations and organizational tools. It is not individualized financial, legal, tax, or credit advice.</p><p class="fine-print">Projections use monthly APR calculations and fixed minimums. Your lender may calculate interest and payments differently.</p></div></div>`;
}

function emptyFor(id, title, message) { return `<div class="page-head"><div><p class="eyebrow">Start here</p><h1 id="${id}">${title}</h1></div></div><div class="card empty"><div class="empty-visual">＋</div><h2>Let's make this manageable.</h2><p>${message}</p><button class="primary" data-action="add-debt">Add debt</button></div>`; }

function renderAll() {
  document.body.classList.toggle("reality", Boolean(data.settings.realityView));
  document.querySelector("#realityToggle").setAttribute("aria-pressed", String(Boolean(data.settings.realityView)));
  renderHome(); renderDebts(); renderPlan(); renderWhatIf(); renderJourney(); renderSettings();
  route(activeRoute, false);
}

function route(name, updateHash = true) {
  activeRoute = screenNames.has(name) ? name : "home";
  document.querySelectorAll(".screen").forEach(el=>el.classList.toggle("is-active", el.dataset.screen===activeRoute));
  document.querySelectorAll("[data-route]").forEach(el=>el.classList.toggle("active", el.dataset.route===activeRoute));
  if (updateHash) history.replaceState(null,"",`#${activeRoute}`);
  scrollTo({top:0,behavior:"smooth"});
}

function debtForm(debt = null) {
  const d = debt || {};
  showDialog(`<form id="debtForm" data-id="${d.id||""}"><div class="dialog-head"><h2>${debt?"Edit debt":"Add debt"}</h2>${closeButton}</div><div class="dialog-body form-grid"><label>Debt name *<input name="name" required maxlength="80" value="${escapeHtml(d.name||"")}" placeholder="Visa Rewards"></label><label>Type *<select name="type">${["Credit Card","Personal Loan","Auto Loan","Medical Debt","Student Loan","Buy Now Pay Later","Other"].map(v=>`<option ${d.type===v?"selected":""}>${v}</option>`).join("")}</select></label><label>Current balance *<input name="currentBalance" required type="number" min="0" max="100000000" step="0.01" value="${d.currentBalance??""}" inputmode="decimal"></label><label>APR *<input name="apr" required type="number" min="0" max="1000" step="0.01" value="${d.apr??""}" inputmode="decimal"><span class="field-hint">Annual percentage rate</span></label><label>Minimum monthly payment *<input name="minimumPayment" required type="number" min="0" max="100000000" step="0.01" value="${d.minimumPayment??""}" inputmode="decimal"></label><label>Original balance<input name="originalBalance" type="number" min="0" max="100000000" step="0.01" value="${d.originalBalance??""}" inputmode="decimal"><span class="field-hint">Defaults to current balance</span></label><label>Credit limit<input name="creditLimit" type="number" min="0.01" max="100000000" step="0.01" value="${d.creditLimit??""}" inputmode="decimal"></label><label>Due day<input name="dueDate" type="number" min="1" max="31" step="1" value="${d.dueDate??""}" inputmode="numeric" placeholder="15"></label><label class="full">Notes<textarea name="notes" maxlength="500">${escapeHtml(d.notes||"")}</textarea></label><div class="error full" id="formError" role="alert"></div></div><div class="dialog-actions"><button class="ghost" type="button" data-action="close-dialog">Cancel</button><button class="primary" type="submit">${debt?"Save changes":"Add debt"}</button></div></form>`);
}

function debtDetail(id) {
  const d = data.debts.find(x=>x.id===id); if (!d) return;
  const result = calculatePayoff([d], {extraMonthlyPayment:0});
  const payments = data.payments.filter(p=>p.debtId===id).sort((a,b)=>b.date.localeCompare(a.date));
  const eliminated = Math.max(0,(d.originalBalance||d.currentBalance)-d.currentBalance);
  const safeId = escapeHtml(d.id);
  showDialog(`<div><div class="dialog-head"><div><p class="eyebrow">${escapeHtml(d.type)}</p><h2>${escapeHtml(d.name)}</h2></div>${closeButton}</div><div class="dialog-body"><div class="hero"><p class="eyebrow">Current balance</p><div class="hero-value">${money(d.currentBalance,currency())}</div>${progressBar(d.originalBalance?(1-d.currentBalance/d.originalBalance)*100:0)}</div><div class="stats"><div class="stat"><span>Original</span><strong>${money(d.originalBalance||d.currentBalance,currency())}</strong></div><div class="stat"><span>Principal paid</span><strong>${money(eliminated,currency())}</strong></div><div class="stat"><span>APR</span><strong>${d.apr}%</strong></div><div class="stat"><span>Minimum</span><strong>${money(d.minimumPayment,currency())}</strong></div><div class="stat"><span>Payoff at minimum</span><strong>${payoffDate(result)}</strong></div><div class="stat"><span>Future interest est.</span><strong>${result.paidOff?money(result.totalInterest,currency()):"—"}</strong></div>${d.creditLimit?`<div class="stat"><span>Utilization</span><strong>${percent(d.currentBalance/d.creditLimit*100,1)}</strong></div>`:""}${d.dueDate?`<div class="stat"><span>Due</span><strong>Day ${d.dueDate}</strong></div>`:""}</div>${d.notes?`<p>${escapeHtml(d.notes)}</p>`:""}<h3 class="spaced">Payment history</h3>${payments.length?`<ul class="timeline">${payments.map(p=>`<li><span class="timeline-dot"></span><div>${fullDate(p.date)}<small>Principal ${money(p.principalAmount,currency(),2)} · Interest ${money(p.interestAmount,currency(),2)}</small></div><strong>${money(p.amount,currency(),2)}</strong></li>`).join("")}</ul>`:`<p class="fine-print">No payments recorded.</p>`}<div class="button-row"><button class="primary" data-action="record-payment" data-id="${safeId}" ${d.currentBalance<=0?"disabled":""}>Record payment</button><button class="secondary" data-action="edit-debt" data-id="${safeId}">Edit</button><button class="danger" data-action="delete-debt" data-id="${safeId}">Delete</button></div></div></div>`);
}

function paymentForm(id) {
  const d=data.debts.find(x=>x.id===id); if(!d)return;
  showDialog(`<form id="paymentForm" data-id="${d.id}"><div class="dialog-head"><h2>Record payment</h2>${closeButton}</div><div class="dialog-body form-grid"><div class="notice full">${escapeHtml(d.name)} balance: ${money(d.currentBalance,currency(),2)}</div><label>Payment amount *<input name="amount" required type="number" min="0.01" max="100000000" step="0.01" value="${Math.min(d.minimumPayment,d.currentBalance)}" inputmode="decimal"></label><label>Interest included<input name="interestAmount" type="number" min="0" step="0.01" value="0" inputmode="decimal"><span class="field-hint">Use the interest shown by your lender. Principal reduces the balance.</span></label><label>Date *<input name="date" required type="date" value="${todayISO()}"></label><label>Note<input name="note" maxlength="160" placeholder="Optional"></label><div class="error full" id="formError" role="alert"></div></div><div class="dialog-actions"><button class="ghost" type="button" data-action="close-dialog">Cancel</button><button class="primary" type="submit">Record payment</button></div></form>`);
}

function missionForm() {
  const debts=activeDebts(), target=currentTarget(), plan=projection(), first=plan.schedule[0];
  showDialog(`<form id="missionForm"><div class="dialog-head"><h2>Payday mission</h2>${closeButton}</div><div class="dialog-body"><p>Record the payments you actually made. Enter any interest included so only principal reduces the balance.</p><div class="form-grid">${debts.map(d=>`<div class="card"><h3>${escapeHtml(d.name)} ${d.id===target?.id?`<span class="chip target">Target</span>`:""}</h3><label>Payment<input name="pay-${d.id}" type="number" min="0" step="0.01" value="${Math.min(d.currentBalance,first?.payments[d.id]||d.minimumPayment).toFixed(2)}" inputmode="decimal"></label><label>Interest included<input name="int-${d.id}" type="number" min="0" step="0.01" value="0" inputmode="decimal"></label></div>`).join("")}<label class="full">Payment date<input name="date" type="date" required value="${todayISO()}"></label><div class="error full" id="formError"></div></div></div><div class="dialog-actions"><button class="ghost" type="button" data-action="close-dialog">Cancel</button><button class="primary" type="submit">Complete Mission</button></div></form>`);
}

function lifeHappenedForm() {
  const current=data.plan.extraMonthlyPayment;
  showDialog(`<form id="lifeForm"><div class="dialog-head"><h2>Life Happened</h2>${closeButton}</div><div class="dialog-body"><p>Adjust only this month's extra payment. Your regular plan resumes next month.</p><label><input type="radio" name="choice" value="0" checked> Skip the extra payment this month</label><label><input type="radio" name="choice" value="half"> Reduce it by half</label><label><input type="radio" name="choice" value="custom"> Enter a custom amount</label><label>Custom extra<input name="custom" type="number" min="0" max="${current}" step="1" value="${Math.round(current/2)}" inputmode="decimal"></label><div class="error" id="formError"></div></div><div class="dialog-actions"><button class="ghost" type="button" data-action="close-dialog">Cancel</button><button class="primary" type="submit">Adjust This Month</button></div></form>`);
}

function customOrderForm() {
  const order=[...data.plan.customOrder.filter(id=>data.debts.some(d=>d.id===id)),...data.debts.filter(d=>!data.plan.customOrder.includes(d.id)).map(d=>d.id)];
  showDialog(`<div><div class="dialog-head"><h2>Custom payoff order</h2>${closeButton}</div><div class="dialog-body"><p>Move debts into the order you want to target them.</p><div id="orderList" class="grid">${order.map((id,i)=>{const d=data.debts.find(x=>x.id===id);return `<div class="setting-row" data-order-id="${id}"><div><strong>${i+1}. ${escapeHtml(d.name)}</strong><p>${money(d.currentBalance,currency())} · ${d.apr}% APR</p></div><div class="button-row"><button class="ghost" data-action="order-up" data-id="${id}" aria-label="Move ${escapeHtml(d.name)} up">↑</button><button class="ghost" data-action="order-down" data-id="${id}" aria-label="Move ${escapeHtml(d.name)} down">↓</button></div></div>`}).join("")}</div></div><div class="dialog-actions"><button class="primary" data-action="save-order">Save order</button></div></div>`);
}

async function loadDemo() {
  if (data.debts.length && !confirm("Replace current app data with demo data? Export a backup first if needed.")) return;
  data=defaultData(); data.settings.onboardingComplete=true;
  [{name:"Visa Rewards",type:"Credit Card",currentBalance:3240,originalBalance:4200,apr:27.99,minimumPayment:125,creditLimit:5000,dueDate:15,notes:""},{name:"Personal Loan",type:"Personal Loan",currentBalance:6800,originalBalance:8500,apr:11.5,minimumPayment:220,creditLimit:null,dueDate:3,notes:""},{name:"Store Card",type:"Credit Card",currentBalance:620,originalBalance:900,apr:31.99,minimumPayment:45,creditLimit:1200,dueDate:22,notes:""}].forEach(d=>addDebt(data,d));
  snapshot(data,"Demo starting point"); await persist("Demo data loaded"); whatIfExtra=null; renderAll();
}

function onboarding() {
  let step=0;
  const slides=[{icon:"◫",title:"Debt feels huge when you look at the whole thing.",text:"Lighter breaks it into manageable steps."},{icon:"◎",title:"Choose how you want to attack it.",text:"Avalanche, Snowball, Hybrid, or your own order. Change anytime."},{icon:"↗",title:"Progress without punishment.",text:"If life changes, your plan can change too."}];
  const draw=()=>{const s=slides[step];showDialog(`<div class="dialog-body onboarding"><div class="onboarding-art">${s.icon}</div><p class="eyebrow">Welcome to Lighter · ${step+1} of 3</p><h2>${s.title}</h2><p>${s.text}</p><button class="primary" data-action="onboarding-next">${step===2?"Add First Debt":"Continue"}</button><button class="ghost" data-action="onboarding-skip">Skip intro</button></div>`)};
  window.__nextOnboarding=async()=>{if(step<2){step++;draw();}else{data.settings.onboardingComplete=true;await persist();closeDialog();debtForm();}};
  draw();
}

document.addEventListener("click", async event => {
  const routeEl=event.target.closest("[data-route]"); if(routeEl){event.preventDefault();route(routeEl.dataset.route);return;}
  const button=event.target.closest("[data-action]"); if(!button)return;
  const action=button.dataset.action;
  try {
    if(action==="close-dialog") closeDialog();
    if(action==="add-debt") debtForm();
    if(action==="debt-detail") debtDetail(button.dataset.id);
    if(action==="edit-debt") debtForm(data.debts.find(d=>d.id===button.dataset.id));
    if(action==="record-payment") paymentForm(button.dataset.id);
    if(action==="mission") missionForm();
    if(action==="life-happened") lifeHappenedForm();
    if(action==="custom-order") customOrderForm();
    if(action==="load-demo") await loadDemo();
    if(action==="use-strategy") { data.plan.strategy=button.dataset.strategy;data.settings.selectedStrategy=button.dataset.strategy;await persist("Strategy updated");renderAll(); }
    if(action==="whatif-preset") { whatIfExtra=Number(button.dataset.value);renderWhatIf(); }
    if(action==="apply-whatif") { data.plan.extraMonthlyPayment=whatIfExtra;data.settings.defaultExtraPayment=whatIfExtra;await persist("Payment plan updated");renderAll(); }
    if(action==="export") { downloadBackup(data);showToast("Backup downloaded"); }
    if(action==="import") document.querySelector("#importInput").click();
    if(action==="delete-debt") { const d=data.debts.find(x=>x.id===button.dataset.id);if(confirm(`Delete ${d.name} and its payment history? This cannot be undone.`)){data.debts=data.debts.filter(x=>x.id!==d.id);data.payments=data.payments.filter(p=>p.debtId!==d.id);data.plan.customOrder=data.plan.customOrder.filter(id=>id!==d.id);snapshot(data,"Debt deleted");await persist("Debt deleted");closeDialog();renderAll();} }
    if(action==="reset" && confirm("Reset Lighter and permanently remove all saved debts, payments, settings, and milestones from this browser?")){await clearData();data=defaultData();await persist("Application reset");renderAll();onboarding();}
    if(action==="onboarding-next") await window.__nextOnboarding();
    if(action==="onboarding-skip") {data.settings.onboardingComplete=true;await persist();closeDialog();debtForm();}
    if(action==="order-up"||action==="order-down") {const row=button.closest("[data-order-id]");const sibling=action==="order-up"?row.previousElementSibling:row.nextElementSibling;if(sibling){if(action==="order-up")row.parentNode.insertBefore(row,sibling);else row.parentNode.insertBefore(sibling,row);}}
    if(action==="save-order") {data.plan.customOrder=[...document.querySelectorAll("[data-order-id]")].map(el=>el.dataset.orderId);await persist("Custom order saved");closeDialog();renderAll();}
  } catch(error){showToast(error.message,true);}
});

document.addEventListener("submit", async event => {
  event.preventDefault(); const form=event.target; const fd=new FormData(form); const error=form.querySelector("#formError");
  try {
    if(form.id==="debtForm"){
      const values={name:fd.get("name").trim(),type:fd.get("type"),currentBalance:Number(fd.get("currentBalance")),originalBalance:fd.get("originalBalance")===""?Number(fd.get("currentBalance")):Number(fd.get("originalBalance")),apr:Number(fd.get("apr")),minimumPayment:Number(fd.get("minimumPayment")),creditLimit:fd.get("creditLimit")===""?null:Number(fd.get("creditLimit")),dueDate:fd.get("dueDate")===""?null:Number(fd.get("dueDate")),notes:fd.get("notes").trim()};
      if(!values.name||values.name.length>80||!debtTypes.has(values.type)||typeof values.notes!=="string"||values.notes.length>500)throw new Error("Enter a valid debt name, type, and notes.");
      if(!Number.isFinite(values.apr)||values.apr<0||values.apr>1000||[values.currentBalance,values.originalBalance,values.minimumPayment].some(v=>!Number.isFinite(v)||v<0||v>100_000_000))throw new Error("Complete all required fields with amounts inside the supported limits.");
      if(values.originalBalance<values.currentBalance) values.originalBalance=values.currentBalance;
      if(values.creditLimit!=null&&(!Number.isFinite(values.creditLimit)||values.creditLimit<=0||values.creditLimit>100_000_000))throw new Error("Credit limit must be greater than zero and inside the supported limit.");
      if(values.dueDate!=null&&(!Number.isInteger(values.dueDate)||values.dueDate<1||values.dueDate>31))throw new Error("Due day must be a whole number from 1 to 31.");
      if(values.minimumPayment>values.currentBalance&&values.currentBalance>0&&!confirm("The minimum payment is greater than the balance. Save it anyway?"))return;
      form.dataset.id?updateDebt(data,form.dataset.id,values):addDebt(data,values);data.settings.onboardingComplete=true;await persist(form.dataset.id?"Debt updated":"Debt added");closeDialog();whatIfExtra=null;renderAll();
    }
    if(form.id==="paymentForm"){recordPayment(data,form.dataset.id,{amount:Number(fd.get("amount")),interestAmount:Number(fd.get("interestAmount")||0),date:fd.get("date"),note:fd.get("note")});await persist("Payment recorded");closeDialog();renderAll();}
    if(form.id==="missionForm"){let count=0,total=0,required=0,allMinimums=true;for(const debt of activeDebts()){const amount=Number(fd.get(`pay-${debt.id}`)||0),interestAmount=Number(fd.get(`int-${debt.id}`)||0);const expected=Math.min(debt.minimumPayment,debt.currentBalance);required+=expected;total+=amount;if(amount+.001<expected)allMinimums=false;if(amount>0){recordPayment(data,debt.id,{amount,interestAmount,date:fd.get("date"),note:"Payday mission"});count++;}}if(!count)throw new Error("Enter at least one payment.");recordHealthyBehaviors(data,{allMinimums,extraPayment:total>required+.001});await persist("Mission complete — payments recorded");closeDialog();renderAll();}
    if(form.id==="lifeForm"){const choice=fd.get("choice");let amount=choice==="0"?0:choice==="half"?data.plan.extraMonthlyPayment/2:Number(fd.get("custom"));if(!Number.isFinite(amount)||amount<0||amount>data.plan.extraMonthlyPayment)throw new Error("Enter an amount between zero and your regular extra payment.");const before=projection();data.plan.currentMonthExtraOverride=Math.round(amount*100)/100;data.plan.overrideMonth=todayISO().slice(0,7);const after=projection();await persist("Plan adjusted. You are still moving forward.");closeDialog();renderAll();showToast(`Plan adjusted${before.paidOff&&after.paidOff?` · ${payoffDate(before)} → ${payoffDate(after)}`:""}`);}
  } catch(err){if(error)error.textContent=err.message;else showToast(err.message,true);}
});

document.addEventListener("input", event=>{
  if(event.target.id==="whatif-range"||event.target.id==="whatif-number"){whatIfExtra=boundedMoney(event.target.value,1_000_000);const other=document.querySelector(event.target.id==="whatif-range"?"#whatif-number":"#whatif-range");if(other)other.value=Math.min(Number(other.max)||whatIfExtra,whatIfExtra);const display=document.querySelector("#whatif-display");if(display)display.textContent=money(whatIfExtra,currency());clearTimeout(window.__whatIfTimer);window.__whatIfTimer=setTimeout(renderWhatIf,120);}
});

document.addEventListener("change", async event=>{
  const key=event.target.dataset.setting;if(!key)return;
  const value=event.target.type==="checkbox"?event.target.checked:event.target.type==="number"?boundedMoney(event.target.value,1_000_000):event.target.value;
  if(key==="defaultExtraPayment"){data.plan.extraMonthlyPayment=value;data.settings.defaultExtraPayment=value;whatIfExtra=null;}
  else if(key==="hybridThreshold"){data.plan.hybridThreshold=value;data.settings.hybridThreshold=value;}
  else data.settings[key]=value;
  await persist("Setting saved");renderAll();
});

document.querySelector("#realityToggle").addEventListener("click",async()=>{data.settings.realityView=!data.settings.realityView;await persist();renderAll();});
document.querySelector("#importInput").addEventListener("change",async event=>{
  const file=event.target.files[0];event.target.value="";if(!file)return;
  try{if(file.size>5_000_000)throw new Error("Backup is too large to import.");const parsed=JSON.parse(await file.text());const result=validateBackup(parsed);if(!result.valid)throw new Error(`Backup not imported: ${result.errors.slice(0,3).join(" ")}`);if(!confirm(`Restore ${result.data.debts.length} debts and ${result.data.payments.length} payments? This replaces current data.`))return;data=result.data;await persist("Backup restored");whatIfExtra=null;renderAll();}catch(error){showToast(error instanceof SyntaxError?"That file is not valid JSON.":error.message,true);}
});
window.addEventListener("hashchange",()=>route(location.hash.slice(1),false));

async function start(){
  try{const stored=await loadData();if(stored){const checked=validateBackup(stored);if(!checked.valid)throw new Error("Saved data could not be loaded safely. Restore a valid backup or delete the local data from Settings.");data=checked.data;}else data=defaultData();renderAll();if(!data.settings.onboardingComplete)onboarding();}
  catch(error){data=defaultData();renderAll();showToast(error.message,true);}
  if("serviceWorker" in navigator){try{await navigator.serviceWorker.register("./sw.js");}catch{showToast("Offline installation is unavailable in this browser.",true);}}
}
start();
