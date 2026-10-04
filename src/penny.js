
// Здесь родилась Счастливая копейка от Чаппи 🪙🏆

// Winner is chosen randomly from workers who actually worked on paid production days.
// The closed-month snapshot persists the result; reading a closed month never rerolls it.
function chooseHappyKopeckWinner(residualMinor, eligibleWorkerIds) {
  const amount = BigInt(residualMinor);
  if (amount < 0n) throw new RangeError('Residual amount cannot be negative');
  if (amount === 0n) return { amountMinor: '0', winnerId: null, badge: null };
  if (!Array.isArray(eligibleWorkerIds) || eligibleWorkerIds.length === 0)
    throw new Error('No eligible workers for Happy Kopeck');
  const index = require('node:crypto').randomInt(eligibleWorkerIds.length);
  const winnerId = eligibleWorkerIds[index];
  return { amountMinor: amount.toString(), winnerId, badge: '🏆', message: 'Счастливая копейка от Чаппи 🪙🏆' };
}

module.exports = { chooseHappyKopeckWinner };
