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

-- Keep upgrades from older installs safe.
ALTER TABLE production_allocations ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;

ALTER TABLE production_entries ALTER COLUMN rate_snapshot_minor DROP NOT NULL;
ALTER TABLE production_entries ALTER COLUMN total_minor SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS monthly_worker_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month DATE NOT NULL,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  work_days INTEGER NOT NULL CHECK (work_days >= 0),
  daily_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_month, worker_id)
);
CREATE INDEX IF NOT EXISTS idx_monthly_worker_earnings_period
  ON monthly_worker_earnings(period_month);
