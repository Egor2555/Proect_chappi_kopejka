CREATE TABLE IF NOT EXISTS production_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_entry_id UUID NOT NULL REFERENCES production_entries(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  allocation_type TEXT NOT NULL CHECK (allocation_type IN ('direct','surplus')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_allocations_order_product ON production_allocations(order_id,product_id);
