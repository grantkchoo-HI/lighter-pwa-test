import { orderDebts } from "./strategies.js";

export const MAX_MONTHS = 1200;
const cents = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function safeDebt(debt) {
  return {
    ...debt,
    currentBalance: Math.max(0, cents(Number(debt.currentBalance) || 0)),
    apr: Math.max(0, Number(debt.apr) || 0),
    minimumPayment: Math.max(0, cents(Number(debt.minimumPayment) || 0))
  };
}

/**
 * Forecasts payoff one month at a time. APR is divided by 12 and interest is
 * rounded to cents. Fixed minimums plus extra form one budget, so unused and
 * paid-off minimums roll to the current target.
 */
export function calculatePayoff(inputDebts, options = {}) {
  const debts = inputDebts.map(safeDebt);
  const strategy = options.strategy || "avalanche";
  const regularExtra = Math.max(0, cents(Number(options.extraMonthlyPayment) || 0));
  const baseMinimums = cents(debts.reduce((sum, debt) => sum + debt.minimumPayment, 0));
  const hybridSmallIds = debts.filter(d => d.currentBalance > 0 && d.currentBalance <= (options.hybridThreshold ?? 1000)).map(d => d.id);
  const strategyOptions = { ...options, hybridSmallIds };
  const initialTotal = cents(debts.reduce((sum, debt) => sum + debt.currentBalance, 0));
  const schedule = [];
  let totalInterest = 0;
  let month = 0;
  let stalled = false;
  let previousTotal = initialTotal;

  if (initialTotal === 0) return { paidOff: true, months: 0, totalInterest: 0, schedule, endingBalances: debts, monthlyBudget: baseMinimums + regularExtra };

  while (month < (options.maxMonths || MAX_MONTHS) && debts.some(d => d.currentBalance > 0)) {
    month += 1;
    const payments = {};
    const interest = {};
    const startingBalances = Object.fromEntries(debts.map(d => [d.id, d.currentBalance]));

    for (const debt of debts) {
      if (debt.currentBalance <= 0) continue;
      const charge = cents(debt.currentBalance * (debt.apr / 100 / 12));
      debt.currentBalance = cents(debt.currentBalance + charge);
      interest[debt.id] = charge;
      totalInterest = cents(totalInterest + charge);
    }

    const override = month === 1 && options.firstMonthExtra != null ? Number(options.firstMonthExtra) : regularExtra;
    const oneTime = cents((options.oneTimePayments || []).filter(p => Number(p.month || 1) === month).reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0));
    let budget = cents(baseMinimums + Math.max(0, override) + oneTime);

    for (const debt of debts) {
      if (debt.currentBalance <= 0 || budget <= 0) continue;
      const payment = cents(Math.min(debt.minimumPayment, debt.currentBalance, budget));
      debt.currentBalance = cents(debt.currentBalance - payment);
      payments[debt.id] = cents((payments[debt.id] || 0) + payment);
      budget = cents(budget - payment);
    }

    let guard = 0;
    while (budget > 0 && debts.some(d => d.currentBalance > 0) && guard < debts.length + 2) {
      const target = orderDebts(debts, strategy, strategyOptions)[0];
      if (!target) break;
      const payment = cents(Math.min(target.currentBalance, budget));
      target.currentBalance = cents(target.currentBalance - payment);
      payments[target.id] = cents((payments[target.id] || 0) + payment);
      budget = cents(budget - payment);
      guard += 1;
    }

    const endingTotal = cents(debts.reduce((sum, debt) => sum + debt.currentBalance, 0));
    schedule.push({
      month,
      startingBalances,
      endingBalances: Object.fromEntries(debts.map(d => [d.id, d.currentBalance])),
      interest,
      payments,
      totalBalance: endingTotal,
      interestThisMonth: cents(Object.values(interest).reduce((sum, value) => sum + value, 0)),
      paymentThisMonth: cents(Object.values(payments).reduce((sum, value) => sum + value, 0))
    });
    if (endingTotal >= previousTotal && Object.values(payments).reduce((a, b) => a + b, 0) <= Object.values(interest).reduce((a, b) => a + b, 0)) {
      stalled = true;
      break;
    }
    previousTotal = endingTotal;
  }

  const paidOff = debts.every(d => d.currentBalance === 0);
  return {
    paidOff,
    months: paidOff ? month : null,
    calculatedMonths: month,
    totalInterest: cents(totalInterest),
    schedule,
    endingBalances: debts,
    monthlyBudget: cents(baseMinimums + regularExtra),
    stalled: !paidOff && stalled
  };
}

export function compareStrategies(debts, options = {}) {
  return ["avalanche", "snowball", "hybrid", "custom"].map(strategy => ({
    strategy,
    ...calculatePayoff(debts, { ...options, strategy })
  }));
}

export function addMonths(date, months) {
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + Number(months || 0));
  return result;
}

