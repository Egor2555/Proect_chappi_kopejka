function calculateTotalMinor(unitMinor, quantity) {
  const unit = BigInt(unitMinor);
  const qty = BigInt(quantity);
  if (unit < 0n || qty < 0n) throw new RangeError('Amounts and quantities cannot be negative');
  return (unit * qty).toString();
}

function calculateMonthlyWorkerEarnings(days) {
  if (!Array.isArray(days)) throw new TypeError('Days must be an array');
  const totals = new Map();
  const details = new Map();
  let residualMinor = 0n;

  for (const day of days) {
    const totalMinor = BigInt(day.totalMinor);
    const workers = Array.isArray(day.workerIds) ? day.workerIds : [];
    if (totalMinor < 0n) throw new RangeError('Day total cannot be negative');
    if (!workers.length) throw new RangeError('Each production day must have at least one worker');

    const share = totalMinor / BigInt(workers.length);
    residualMinor += totalMinor % BigInt(workers.length);

    for (const workerId of workers) {
      totals.set(workerId, (totals.get(workerId) || 0n) + share);
      if (!details.has(workerId)) details.set(workerId, []);
      details.get(workerId).push({
        date: String(day.date),
        teamId: day.teamId,
        dayTotalMinor: totalMinor.toString(),
        workers: workers.length,
        shareMinor: share.toString()
      });
    }
  }

  return {
    earnings: [...totals.entries()].map(([workerId, amountMinor]) => ({
      workerId,
      amountMinor: amountMinor.toString(),
      workDays: details.get(workerId).length,
      dailyDetails: details.get(workerId)
    })),
    residualMinor: residualMinor.toString()
  };
}

function allocateProduction(quantity, directNeed, queuedOrders) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new RangeError('Invalid production quantity');
  let remaining = quantity;
  const allocations = [];
  const direct = Math.min(remaining, Math.max(0, Number(directNeed) || 0));
  if (direct > 0) allocations.push({ orderId: 'direct', quantity: direct, type: 'direct' });
  remaining -= direct;
  const ordered = [...queuedOrders].sort((a,b) =>
    Number(b.priority || 0) - Number(a.priority || 0) ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  for (const order of ordered) {
    if (!remaining) break;
    const need = Math.max(0, Number(order.required) - Number(order.done));
    const quantityForOrder = Math.min(need, remaining);
    if (quantityForOrder > 0) {
      allocations.push({ orderId: order.id, quantity: quantityForOrder, type: 'surplus' });
      remaining -= quantityForOrder;
    }
  }
  return { allocations, freeStock: remaining };
}

module.exports = { calculateTotalMinor, calculateMonthlyWorkerEarnings, allocateProduction };
