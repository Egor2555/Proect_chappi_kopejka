function calculateTotalMinor(unitMinor, quantity) {
  const unit = BigInt(unitMinor);
  const qty = BigInt(quantity);
  if (unit < 0n || qty < 0n) throw new RangeError('Amounts and quantities cannot be negative');
  return (unit * qty).toString();
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

module.exports = { calculateTotalMinor, allocateProduction };
