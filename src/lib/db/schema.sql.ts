export const POSTGRES_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'WAREHOUSE_OPERATOR', 'SUPPORT', 'ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  on_hand INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  damaged INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (variant_id, warehouse_id),
  CONSTRAINT chk_inventory_non_negative CHECK (
    on_hand >= 0 AND available >= 0 AND reserved >= 0 AND damaged >= 0
  ),
  CONSTRAINT chk_inventory_balance_equation CHECK (
    on_hand = available + reserved
  )
);

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'RESTOCK',
      'RESERVE',
      'RELEASE_EXPIRED',
      'RELEASE_CANCELLED',
      'COMMIT_SALE',
      'RETURN_TO_AVAILABLE',
      'RETURN_TO_DAMAGED',
      'MANUAL_ADJUSTMENT'
    )
  ),
  quantity_delta INTEGER NOT NULL,
  on_hand_after INTEGER NOT NULL,
  available_after INTEGER NOT NULL,
  reserved_after INTEGER NOT NULL,
  damaged_after INTEGER NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_variant_created ON inventory_ledger(variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON inventory_ledger(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (
    status IN (
      'PENDING_PAYMENT',
      'PAID',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'EXPIRED',
      'CANCELLED',
      'RETURN_REQUESTED',
      'RETURNED',
      'REFUND_PENDING',
      'REFUNDED'
    )
  ),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  reservation_expires_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status_expires ON orders(status, reservation_expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  sku_snapshot TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  returned_to_good INTEGER NOT NULL DEFAULT 0 CHECK (returned_to_good >= 0),
  returned_to_damaged INTEGER NOT NULL DEFAULT 0 CHECK (returned_to_damaged >= 0)
);

CREATE TABLE IF NOT EXISTS stock_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (
    status IN ('ACTIVE', 'CONFIRMED', 'RELEASED_EXPIRED', 'RELEASED_CANCELLED', 'COMMITTED')
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_lookup ON stock_reservations(variant_id, status, expires_at);

CREATE TABLE IF NOT EXISTS order_state_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  actor_role TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_state_history(order_id, created_at ASC);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
