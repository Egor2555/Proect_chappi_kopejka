CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('worker','brigadier','admin')),
  worker_id UUID,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pin_ciphertext TEXT,
  pin_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pin_failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (pin_failed_attempts >= 0),
  pin_locked BOOLEAN NOT NULL DEFAULT FALSE,
  last_activity_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_worker_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS team_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  valid_from DATE NOT NULL,
  valid_to DATE,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  section_width_mm INTEGER NOT NULL DEFAULT 60,
  section_height_mm INTEGER NOT NULL DEFAULT 40,
  length_mm INTEGER NOT NULL CHECK (length_mm > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  period_month DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'UAH',
  created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, period_month)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE,
  title TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','active','completed','closed','archived','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  required_qty INTEGER NOT NULL CHECK (required_qty > 0),
  UNIQUE(order_id, product_id)
);

CREATE TABLE IF NOT EXISTS production_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date DATE NOT NULL,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  rate_id UUID REFERENCES rates(id) ON DELETE RESTRICT,
  rate_snapshot_minor BIGINT CHECK (rate_snapshot_minor >= 0),
  total_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  void_reason TEXT
);

CREATE TABLE IF NOT EXISTS attendance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date DATE NOT NULL,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  was_brigadier BOOLEAN NOT NULL DEFAULT FALSE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_date, worker_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('production_in','surplus_transfer','shipment_out','adjustment_in','adjustment_out')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  production_entry_id UUID REFERENCES production_entries(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  reference_id UUID,
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  shipped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient TEXT,
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS payment_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  credited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_recovery_user_created
  ON admin_recovery_codes(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS login_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  username_attempt TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monthly_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month DATE NOT NULL UNIQUE,
  totals JSONB NOT NULL,
  closed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS penny_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month DATE NOT NULL,
  source_minor BIGINT NOT NULL,
  distributed_minor BIGINT NOT NULL,
  allocation JSONB NOT NULL,
  algorithm_version TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('simulation','approved','voided'))
);

CREATE INDEX IF NOT EXISTS idx_production_date ON production_entries(work_date);
CREATE INDEX IF NOT EXISTS idx_production_team_date ON production_entries(team_id, work_date);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_queue ON orders(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS production_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_entry_id UUID NOT NULL REFERENCES production_entries(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  allocation_type TEXT NOT NULL CHECK (allocation_type IN ('direct','surplus','warehouse')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE production_allocations DROP CONSTRAINT IF EXISTS production_allocations_allocation_type_check;
ALTER TABLE production_allocations ADD CONSTRAINT production_allocations_allocation_type_check
  CHECK (allocation_type IN ('direct','surplus','warehouse'));
CREATE INDEX IF NOT EXISTS idx_allocations_order_product ON production_allocations(order_id,product_id);

INSERT INTO products(code,section_width_mm,section_height_mm,length_mm) VALUES
  ('60x40-1500',60,40,1500),('60x40-1700',60,40,1700),('60x40-2000',60,40,2000),
  ('60x40-2250',60,40,2250),('60x40-2500',60,40,2500),('60x40-3000',60,40,3000),
  ('60x60-2500',60,60,2500),('60x60-3000',60,60,3000),
  ('60x80-5000',60,80,5000),('60x80-6000',60,80,6000)
ON CONFLICT(code) DO NOTHING;
INSERT INTO teams(name) VALUES('Бригада 1') ON CONFLICT(name) DO NOTHING;

CREATE TABLE IF NOT EXISTS fund_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income','expense')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  note TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fund_date ON fund_entries(entry_date);

ALTER TABLE production_allocations ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;


-- Chappi Edition: production is recorded before month-end rates are known.
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
CREATE INDEX IF NOT EXISTS idx_monthly_worker_earnings_period ON monthly_worker_earnings(period_month);

-- Existing installations may already have the old non-null columns.
ALTER TABLE production_entries ALTER COLUMN rate_snapshot_minor DROP NOT NULL;


-- Chappi Edition access profile fields.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_ciphertext TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked BOOLEAN NOT NULL DEFAULT FALSE;


CREATE TABLE IF NOT EXISTS shipment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_item_id UUID NOT NULL REFERENCES shipment_items(id) ON DELETE RESTRICT,
  inventory_movement_id UUID NOT NULL REFERENCES inventory_movements(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shipment_item_id, inventory_movement_id)
);
ALTER TABLE shipment_allocations ADD COLUMN IF NOT EXISTS reservation_movement_id UUID REFERENCES inventory_movements(id) ON DELETE RESTRICT;
ALTER TABLE shipment_allocations DROP CONSTRAINT IF EXISTS shipment_allocations_shipment_item_id_inventory_movement_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_allocations_reserved_unique
  ON shipment_allocations(shipment_item_id,reservation_movement_id)
  WHERE reservation_movement_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_allocations_free_unique
  ON shipment_allocations(shipment_item_id,inventory_movement_id)
  WHERE reservation_movement_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_allocations_inventory ON shipment_allocations(inventory_movement_id);


ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;


-- Chappi Edition 2026-10-05: text labels, brigadier worker marker, daily reports and
-- a reversible brigadier month-close state before final admin payroll calculation.
ALTER TABLE products ADD COLUMN IF NOT EXISTS length_label TEXT;
UPDATE products SET length_label = COALESCE(NULLIF(length_label,''), (length_mm/1000.0)::text || 'метра') WHERE length_label IS NULL OR length_label='';
ALTER TABLE workers ADD COLUMN IF NOT EXISTS is_brigadier BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS workers_one_brigadier_idx ON workers(is_brigadier) WHERE is_brigadier=true;

CREATE TABLE IF NOT EXISTS daily_production_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date DATE NOT NULL,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_date,team_id)
);
ALTER TABLE production_entries ADD COLUMN IF NOT EXISTS daily_report_id UUID REFERENCES daily_production_reports(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_production_daily_report ON production_entries(daily_report_id);

CREATE TABLE IF NOT EXISTS month_states (
  period_month DATE PRIMARY KEY,
  brigadier_closed_at TIMESTAMPTZ,
  brigadier_closed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  reopened_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES users(id) ON DELETE RESTRICT
);

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS payroll_month DATE;
UPDATE shipments SET payroll_month = date_trunc('month', shipped_at)::date WHERE payroll_month IS NULL;
ALTER TABLE shipments ALTER COLUMN payroll_month SET DEFAULT date_trunc('month', CURRENT_TIMESTAMP)::date;
CREATE INDEX IF NOT EXISTS idx_shipments_payroll_month ON shipments(payroll_month);

