import { uid, todayISO } from "./format.js";

export const DATA_VERSION = 1;
export const defaultData = () => ({
  version: DATA_VERSION,
  createdAt: new Date().toISOString(),
  settings: { currency: "USD", selectedStrategy: "avalanche", defaultExtraPayment: 100, hybridThreshold: 1000, theme: "wall", realityView: false, paydayPreference: "Monthly", notifications: false, onboardingComplete: false },
  plan: { strategy: "avalanche", extraMonthlyPayment: 100, customOrder: [], hybridThreshold: 1000, currentMonthExtraOverride: null, overrideMonth: null },
  debts: [], payments: [], milestones: [], balanceHistory: []
});

export function normalizeData(value) {
  const base = defaultData();
  return {
    ...base, ...value,
    version: DATA_VERSION,
    settings: { ...base.settings, ...(value?.settings || {}) },
    plan: { ...base.plan, ...(value?.plan || {}) },
    debts: Array.isArray(value?.debts) ? value.debts : [],
    payments: Array.isArray(value?.payments) ? value.payments : [],
    milestones: Array.isArray(value?.milestones) ? value.milestones : [],
    balanceHistory: Array.isArray(value?.balanceHistory) ? value.balanceHistory : []
  };
}

export function totalDebt(data) { return data.debts.reduce((sum, debt) => sum + Math.max(0, Number(debt.currentBalance) || 0), 0); }
export function originalDebt(data) { return data.debts.reduce((sum, debt) => sum + Math.max(Number(debt.originalBalance) || 0, Number(debt.currentBalance) || 0), 0); }
export function minimums(data) { return data.debts.filter(d => d.status !== "deleted").reduce((sum, debt) => sum + Math.max(0, Number(debt.minimumPayment) || 0), 0); }
export function progress(data) { const original = originalDebt(data); return original ? Math.max(0, Math.min(100, (1 - totalDebt(data) / original) * 100)) : 0; }

export function snapshot(data, reason = "Update") {
  const total = totalDebt(data);
  const date = todayISO();
  const latest = data.balanceHistory[data.balanceHistory.length - 1];
  if (latest?.date === date) Object.assign(latest, { total, reason });
  else data.balanceHistory.push({ id: uid("history"), date, total, reason });
}

function addMilestone(data, type, value, label) {
  if (data.milestones.some(m => m.type === type)) return;
  data.milestones.push({ id: uid("milestone"), type, value, label, achievedAt: new Date().toISOString() });
}

export function evaluateMilestones(data, previous = null) {
  const original = originalDebt(data), current = totalDebt(data), eliminated = Math.max(0, original - current);
  if (data.payments.length) addMilestone(data, "first-payment", data.payments[0].amount, "First payment recorded");
  [100, 500, 1000].forEach(amount => { if (eliminated >= amount) addMilestone(data, `paid-${amount}`, amount, `${amount.toLocaleString()} of principal eliminated`); });
  [10, 25, 50, 75, 100].forEach(pct => { if (original && eliminated / original * 100 >= pct) addMilestone(data, `progress-${pct}`, pct, pct === 100 ? "Debt free" : `${pct}% of debt eliminated`); });
  if (data.debts.some(d => d.status === "paid")) addMilestone(data, "first-debt", 1, "First debt eliminated");
  if (current > 0 && current <= 1000) addMilestone(data, "final-1000", current, "Final $1,000");
  for (const debt of data.debts.filter(d => d.creditLimit > 0)) {
    [90, 75, 50, 30, 10].forEach(level => {
      if (debt.currentBalance / debt.creditLimit * 100 < level) addMilestone(data, `util-${debt.id}-${level}`, level, `${debt.name} below ${level}% utilization`);
    });
  }
  const thisMonth = todayISO().slice(0, 7);
  const earlier = data.balanceHistory.filter(item => item.date.slice(0, 7) < thisMonth).at(-1);
  if (earlier && current <= earlier.total) addMilestone(data, `no-increase-${thisMonth}`, current, "A month without increasing total debt");
}

export function recordHealthyBehaviors(data, { allMinimums = false, extraPayment = false } = {}) {
  const month = todayISO().slice(0, 7);
  if (allMinimums) addMilestone(data, `minimums-${month}`, month, "All planned minimum payments completed");
  if (extraPayment) addMilestone(data, `extra-${month}`, month, "Extra payment completed");
}

export function addDebt(data, values) {
  const debt = { id: uid("debt"), ...values, createdAt: new Date().toISOString(), status: Number(values.currentBalance) === 0 ? "paid" : "active" };
  data.debts.push(debt);
  data.plan.customOrder.push(debt.id);
  snapshot(data, "Debt added");
  evaluateMilestones(data);
  return debt;
}

export function updateDebt(data, id, values) {
  const debt = data.debts.find(item => item.id === id);
  if (!debt) throw new Error("Debt not found.");
  Object.assign(debt, values, { status: Number(values.currentBalance) === 0 ? "paid" : "active", updatedAt: new Date().toISOString() });
  snapshot(data, "Balance updated");
  evaluateMilestones(data);
  return debt;
}

export function recordPayment(data, debtId, values) {
  const debt = data.debts.find(item => item.id === debtId);
  if (!debt) throw new Error("Debt not found.");
  const amount = Number(values.amount), interestAmount = Number(values.interestAmount || 0);
  if (!Number.isFinite(amount) || !Number.isFinite(interestAmount) || !(amount > 0) || amount > 100_000_000 || interestAmount < 0 || interestAmount > amount) throw new Error("Enter a valid payment and interest amount.");
  if (typeof values.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error("Enter a valid payment date.");
  if (typeof values.note !== "string" || values.note.length > 160) throw new Error("Payment notes must be 160 characters or fewer.");
  const principal = Math.round((amount - interestAmount) * 100) / 100;
  if (principal > debt.currentBalance + .001) throw new Error("The principal portion cannot exceed the current balance.");
  const before = debt.currentBalance;
  debt.currentBalance = Math.max(0, Math.round((debt.currentBalance - principal) * 100) / 100);
  debt.status = debt.currentBalance === 0 ? "paid" : "active";
  data.payments.push({ id: uid("payment"), debtId, amount, date: values.date, principalAmount: principal, interestAmount, note: values.note || "", balanceBefore: before, balanceAfter: debt.currentBalance, createdAt: new Date().toISOString() });
  snapshot(data, `Payment to ${debt.name}`);
  evaluateMilestones(data, before);
  return debt;
}

export function reclaimedMonthly(data) { return data.debts.filter(d => d.status === "paid").reduce((sum, d) => sum + Number(d.minimumPayment || 0), 0); }
