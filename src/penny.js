
// Здесь родилась Счастливая копейка от Чаппи 🪙🏆

// The administrator selects the winner at month close. Persist the result once;
// reading a closed month must never select again. No residual means no winner.
function chooseHappyKopeckWinner(residualMinor, eligibleWorkerIds, selectedWorkerId = null) {
  const amount = BigInt(residualMinor);
  if (amount < 0n) throw new RangeError('Residual amount cannot be negative');
  if (amount === 0n) return { amountMinor: '0', winnerId: null, badge: null };
  if (!Array.isArray(eligibleWorkerIds) || eligibleWorkerIds.length === 0)
    throw new Error('No eligible workers for Happy Kopeck');
  if (!selectedWorkerId || !eligibleWorkerIds.includes(selectedWorkerId))
    throw new Error('Administrator must select an eligible worker for Happy Kopeck');
  return { amountMinor: amount.toString(), winnerId: selectedWorkerId, badge: '🏆' };
}

module.exports = { chooseHappyKopeckWinner };
