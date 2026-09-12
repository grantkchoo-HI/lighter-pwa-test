export const STRATEGIES = {
  avalanche: { name: "Debt Avalanche", description: "Targets the highest APR first. Usually reduces interest." },
  snowball: { name: "Debt Snowball", description: "Targets the smallest balance first for earlier wins." },
  hybrid: { name: "Hybrid", description: "Clears small balances at the threshold, then uses Avalanche." },
  custom: { name: "Custom", description: "Uses the payoff order you choose." }
};

const byId = (a, b) => String(a.id).localeCompare(String(b.id));

export function orderDebts(debts, strategy, options = {}) {
  const active = debts.filter(debt => Number(debt.currentBalance) > 0);
  if (strategy === "snowball") {
    return [...active].sort((a, b) => a.currentBalance - b.currentBalance || b.apr - a.apr || byId(a, b));
  }
  if (strategy === "custom") {
    const positions = new Map((options.customOrder || []).map((id, index) => [id, index]));
    return [...active].sort((a, b) => {
      const ai = positions.has(a.id) ? positions.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = positions.has(b.id) ? positions.get(b.id) : Number.MAX_SAFE_INTEGER;
      return ai - bi || byId(a, b);
    });
  }
  const avalancheSort = (a, b) => b.apr - a.apr || a.currentBalance - b.currentBalance || byId(a, b);
  if (strategy === "hybrid") {
    const smallIds = new Set(options.hybridSmallIds || active.filter(d => d.currentBalance <= (options.hybridThreshold ?? 1000)).map(d => d.id));
    return [...active].sort((a, b) => {
      const aSmall = smallIds.has(a.id) ? 0 : 1;
      const bSmall = smallIds.has(b.id) ? 0 : 1;
      if (aSmall !== bSmall) return aSmall - bSmall;
      return aSmall === 0
        ? a.currentBalance - b.currentBalance || b.apr - a.apr || byId(a, b)
        : avalancheSort(a, b);
    });
  }
  return [...active].sort(avalancheSort);
}

export function firstTarget(debts, strategy, options = {}) {
  return orderDebts(debts, strategy, options)[0] || null;
}

