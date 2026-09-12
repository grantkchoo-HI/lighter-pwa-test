import { DATA_VERSION, normalizeData } from "./state.js";

const CURRENCIES = new Set(["USD", "CAD", "EUR", "GBP", "AUD"]);
const STRATEGIES = new Set(["avalanche", "snowball", "hybrid", "custom"]);
const THEMES = new Set(["wall", "clean"]);
const PAYDAYS = new Set(["Weekly", "Every two weeks", "Twice monthly", "Monthly"]);
const DEBT_TYPES = new Set(["Credit Card", "Personal Loan", "Auto Loan", "Medical Debt", "Student Loan", "Buy Now Pay Later", "Other"]);
const STATUSES = new Set(["active", "paid"]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const MAX_MONEY = 100_000_000;

const object = value => value && typeof value === "object" && !Array.isArray(value);
const finiteBetween = (value, min, max) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
const text = (value, max, allowEmpty = true) => typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0);
const safeId = value => typeof value === "string" && SAFE_ID.test(value);
const isoDateTime = value => typeof value === "string" && Number.isFinite(Date.parse(value));

/** Validates untrusted JSON before any imported value reaches storage or HTML rendering. */
export function validateBackup(input) {
  const errors = [];
  if (!object(input)) return { valid: false, errors: ["The file does not contain an application backup."] };
  if (input.version !== DATA_VERSION) errors.push(`Backup version ${input.version ?? "unknown"} is not supported.`);
  if (!object(input.settings) || !object(input.plan)) errors.push("Settings or payoff plan data is missing.");
  for (const key of ["debts", "payments", "milestones", "balanceHistory"]) {
    if (!Array.isArray(input[key])) errors.push(`The ${key} list is missing.`);
  }
  if ((input.debts?.length || 0) > 1000 || (input.payments?.length || 0) > 20000 || (input.milestones?.length || 0) > 20000 || (input.balanceHistory?.length || 0) > 20000) errors.push("The backup contains more records than this version supports.");

  const settings = input.settings || {};
  if (!CURRENCIES.has(settings.currency) || !STRATEGIES.has(settings.selectedStrategy) || !THEMES.has(settings.theme) || !PAYDAYS.has(settings.paydayPreference)) errors.push("One or more settings contain unsupported values.");
  if (![settings.realityView, settings.notifications, settings.onboardingComplete].every(value => typeof value === "boolean")) errors.push("One or more on/off settings are invalid.");
  if (!finiteBetween(settings.defaultExtraPayment, 0, MAX_MONEY) || !finiteBetween(settings.hybridThreshold, 0, MAX_MONEY)) errors.push("One or more numeric settings are invalid.");

  const plan = input.plan || {};
  if (!STRATEGIES.has(plan.strategy) || !finiteBetween(plan.extraMonthlyPayment, 0, MAX_MONEY) || !finiteBetween(plan.hybridThreshold, 0, MAX_MONEY)) errors.push("The payoff plan is invalid.");
  if (!Array.isArray(plan.customOrder) || plan.customOrder.some(id => !safeId(id)) || new Set(plan.customOrder || []).size !== (plan.customOrder || []).length) errors.push("The custom payoff order is invalid.");
  if (plan.currentMonthExtraOverride != null && !finiteBetween(plan.currentMonthExtraOverride, 0, MAX_MONEY)) errors.push("The current-month payment adjustment is invalid.");
  if (plan.overrideMonth != null && (typeof plan.overrideMonth !== "string" || !MONTH.test(plan.overrideMonth))) errors.push("The payment adjustment month is invalid.");
  if (!isoDateTime(input.createdAt)) errors.push("The backup creation date is invalid.");

  const debtIds = new Set();
  for (const [index, debt] of (input.debts || []).entries()) {
    if (!object(debt) || !safeId(debt.id) || !text(debt.name, 80, false)) errors.push(`Debt ${index + 1} is missing a safe ID or name.`);
    if (debtIds.has(debt?.id)) errors.push(`Debt ${index + 1} has a duplicate ID.`); else if (safeId(debt?.id)) debtIds.add(debt.id);
    if (!DEBT_TYPES.has(debt?.type) || !STATUSES.has(debt?.status)) errors.push(`Debt ${index + 1} has an unsupported type or status.`);
    for (const key of ["currentBalance", "originalBalance", "minimumPayment"]) if (!finiteBetween(debt?.[key], 0, MAX_MONEY)) errors.push(`Debt ${index + 1} has an invalid ${key}.`);
    if (!finiteBetween(debt?.apr, 0, 1000)) errors.push(`Debt ${index + 1} has an invalid APR.`);
    if (debt?.creditLimit != null && !finiteBetween(debt.creditLimit, 0.01, MAX_MONEY)) errors.push(`Debt ${index + 1} has an invalid credit limit.`);
    if (debt?.dueDate != null && (!Number.isInteger(Number(debt.dueDate)) || !finiteBetween(debt.dueDate, 1, 31))) errors.push(`Debt ${index + 1} has an invalid due day.`);
    if (!text(debt?.notes ?? "", 500) || !isoDateTime(debt?.createdAt)) errors.push(`Debt ${index + 1} has invalid notes or dates.`);
  }
  if ((plan.customOrder || []).some(id => !debtIds.has(id))) errors.push("The custom payoff order refers to a missing debt.");

  const paymentIds = new Set();
  for (const [index, payment] of (input.payments || []).entries()) {
    if (!object(payment) || !safeId(payment.id) || paymentIds.has(payment.id)) errors.push(`Payment ${index + 1} has an invalid or duplicate ID.`); else paymentIds.add(payment.id);
    if (!debtIds.has(payment?.debtId) || !finiteBetween(payment?.amount, 0.01, MAX_MONEY) || !finiteBetween(payment?.interestAmount, 0, Number(payment?.amount)) || !finiteBetween(payment?.principalAmount, 0, Number(payment?.amount))) errors.push(`Payment ${index + 1} has invalid amounts or refers to a missing debt.`);
    if (typeof payment?.date !== "string" || !DATE.test(payment.date) || !text(payment?.note ?? "", 160) || !isoDateTime(payment?.createdAt)) errors.push(`Payment ${index + 1} has invalid text or dates.`);
  }

  const milestoneIds = new Set();
  for (const [index, milestone] of (input.milestones || []).entries()) {
    if (!object(milestone) || !safeId(milestone.id) || milestoneIds.has(milestone.id) || !safeId(milestone.type)) errors.push(`Milestone ${index + 1} has an invalid or duplicate ID.`); else milestoneIds.add(milestone.id);
    if (!text(milestone?.label, 160, false) || !isoDateTime(milestone?.achievedAt)) errors.push(`Milestone ${index + 1} has invalid text or dates.`);
  }

  const historyIds = new Set();
  for (const [index, entry] of (input.balanceHistory || []).entries()) {
    if (!object(entry) || !safeId(entry.id) || historyIds.has(entry.id)) errors.push(`Journey entry ${index + 1} has an invalid or duplicate ID.`); else historyIds.add(entry.id);
    if (typeof entry?.date !== "string" || !DATE.test(entry.date) || !finiteBetween(entry?.total, 0, MAX_MONEY) || !text(entry?.reason ?? "", 160)) errors.push(`Journey entry ${index + 1} has invalid values.`);
  }

  if (errors.length) return { valid: false, errors };
  return { valid: true, data: normalizeData(input), errors: [] };
}

export function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `lighter-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
