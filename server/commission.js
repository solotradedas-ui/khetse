const TIERS = {
  seed: { rate: 0.15, name: 'Seed Plan', threshold: 0 },
  harvest: { rate: 0.12, name: 'Harvest Plan', threshold: 50000 },
  premium: { rate: 0.08, name: 'Kisan Premium', threshold: 200000 },
};

function getCommissionRate(tier) {
  return TIERS[tier]?.rate ?? 0.15;
}

function calculateCommission(amount, tier) {
  const rate = getCommissionRate(tier);
  const commission = parseFloat((amount * rate).toFixed(2));
  const payout = parseFloat((amount - commission).toFixed(2));
  return { rate, commission, payout };
}

function determineTier(annualSales) {
  if (annualSales >= 200000) return 'premium';
  if (annualSales >= 50000) return 'harvest';
  return 'seed';
}

module.exports = { calculateCommission, determineTier, getCommissionRate, TIERS };
