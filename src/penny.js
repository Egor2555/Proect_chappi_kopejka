const { randomInt } = require('node:crypto');

// Здесь родилась Счастливая копейка от Чаппи 🪙🏆

// No manual winner selection. At month close the residual goes to one
// randomly selected eligible worker. Persist the result once; reading a
// closed month must never draw again. No residual means no winner.
function chooseHappyKopeckWinner(residualMinor, eligibleWorkerIds, random = randomInt) {
  const amount = BigInt(residualMinor);
  if (amount < 0n) throw new RangeError('Residual amount cannot be negative');
  if (amount === 0n) return { amountMinor: '0', winnerId: null, badge: null };
  if (!Array.isArray(eligibleWorkerIds) || eligibleWorkerIds.length === 0)
    throw new Error('No eligible workers for Happy Kopeck');
  const index = random(0, eligibleWorkerIds.length);
  return { amountMinor: amount.toString(), winnerId: eligibleWorkerIds[index], badge: '🏆' };
}

module.exports = { chooseHappyKopeckWinner };
