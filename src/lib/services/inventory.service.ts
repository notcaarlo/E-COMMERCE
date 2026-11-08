import type { Transaction } from "@electric-sql/pglite";
import { createId, getDb, withTransaction } from "@/lib/db";
import {
  DomainError,
  type InventoryLedgerDTO,
  type MovementType,
  type ProductDTO,
  type SessionUser,
} from "@/lib/types/domain";

interface InventoryRow {
  id: string;
  variant_id: string;
  warehouse_id: string;
  on_hand: number;
  available: number;
  reserved: number;
  damaged: number;
  version: number;
}

/**
 * Releases any expired stock reservations (TTL elapsed while order is still PENDING_PAYMENT).
 * Can be scoped to specific variantIds (Lazy Release during checkout) or run globally (Background Worker).
 * Uses SELECT ... FOR UPDATE SKIP LOCKED when running as a worker, or strict FOR UPDATE during lazy release.
 */
export async function releaseExpiredReservationsInTx(
  tx: Transaction,
  options?: { variantIds?: string[]; skipLocked?: boolean }
): Promise<{ expiredOrderIds: string[]; releasedUnits: number }> {
  const skipLockedClause = options?.skipLocked ? "SKIP LOCKED" : "";

  let subQueryFilter = "";
  const params: unknown[] = [];

  if (options?.variantIds && options.variantIds.length > 0) {
    subQueryFilter = ` AND sr.variant_id = ANY($1::text[])`;
    params.push(options.variantIds);
  }

  const expiredOrdersQuery = `
    SELECT o.id, o.order_number, o.status
    FROM orders o
    WHERE o.status = 'PENDING_PAYMENT'
      AND EXISTS (
        SELECT 1
        FROM stock_reservations sr
        WHERE sr.order_id = o.id
          AND sr.status = 'ACTIVE'
          AND sr.expires_at <= NOW()
          ${subQueryFilter}
      )
    ORDER BY o.id ASC
    FOR UPDATE OF o ${skipLockedClause}
  `;

  const expiredOrdersRes = await tx.query<{
    id: string;
    order_number: string;
    status: string;
  }>(expiredOrdersQuery, params);

  const expiredOrderIds: string[] = [];
  let releasedUnits = 0;

  for (const order of expiredOrdersRes.rows) {
    // Fetch active reservations for this order sorted by variant_id to prevent deadlocks
    const reservationsRes = await tx.query<{
      id: string;
      variant_id: string;
      quantity: number;
    }>(
      `SELECT id, variant_id, quantity
       FROM stock_reservations
       WHERE order_id = $1 AND status = 'ACTIVE'
       ORDER BY variant_id ASC
       FOR UPDATE`,
      [order.id]
    );

    if (reservationsRes.rows.length === 0) {
      continue;
    }

    for (const res of reservationsRes.rows) {
      const invRes = await tx.query<InventoryRow>(
        `SELECT id, variant_id, warehouse_id, on_hand, available, reserved, damaged, version
         FROM inventory_items
         WHERE variant_id = $1
         FOR UPDATE`,
        [res.variant_id]
      );

      const inv = invRes.rows[0];
      if (!inv) continue;

      const newAvailable = inv.available + res.quantity;
      const newReserved = inv.reserved - res.quantity;

      await tx.query(
        `UPDATE inventory_items
         SET available = $1,
             reserved = $2,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $3`,
        [newAvailable, newReserved, inv.id]
      );

      await tx.query(
        `UPDATE stock_reservations
         SET status = 'RELEASED_EXPIRED', updated_at = NOW()
         WHERE id = $1`,
        [res.id]
      );

      await tx.query(
        `INSERT INTO inventory_ledger (
          id, inventory_item_id, variant_id, movement_type,
          quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
          reference_type, reference_id, actor_id, reason
        ) VALUES ($1, $2, $3, 'RELEASE_EXPIRED', $4, $5, $6, $7, $8, 'ORDER', $9, NULL, $10)`,
        [
          createId("led"),
          inv.id,
          res.variant_id,
          res.quantity,
          inv.on_hand,
          newAvailable,
          newReserved,
          inv.damaged,
          order.order_number,
          `TTL de reserva expirado automáticamente para pedido ${order.order_number}`,
        ]
      );

      releasedUnits += res.quantity;
    }

    await tx.query(
      `UPDATE orders
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE id = $1`,
      [order.id]
    );

    await tx.query(
      `INSERT INTO order_state_history (
        id, order_id, from_status, to_status, actor_id, actor_role, reason, metadata
      ) VALUES ($1, $2, 'PENDING_PAYMENT', 'EXPIRED', NULL, 'SYSTEM_WORKER', $3, $4::jsonb)`,
      [
        createId("osh"),
        order.id,
        "Reserva de checkout vencida por límite de tiempo (TTL) sin confirmación de pago",
        JSON.stringify({ trigger: options?.variantIds ? "LAZY_RELEASE" : "CRON_WORKER" }),
      ]
    );

    expiredOrderIds.push(order.id);
  }

  return { expiredOrderIds, releasedUnits };
}

/**
 * Background worker entrypoint that sweeps expired reservations using SKIP LOCKED.
 */
export async function runExpireReservationsWorker(): Promise<{
  expiredOrderIds: string[];
  releasedUnits: number;
}> {
  return withTransaction(async (tx) => {
    return releaseExpiredReservationsInTx(tx, { skipLocked: true });
  });
}

export type StockAdjustmentOperation =
  | "RESTOCK"
  | "MARK_DAMAGED"
  | "DISPOSE_DAMAGED"
  | "MANUAL_COUNT_CORRECTION";

export interface AdjustStockInput {
  variantId: string;
  operation: StockAdjustmentOperation;
  quantity: number;
  reason: string;
  actor: SessionUser;
}

/**
 * Allows WAREHOUSE_OPERATOR or ADMIN to perform audited stock movements.
 * SUPPORT and CUSTOMER roles are strictly forbidden from altering physical stock.
 */
export async function adjustStockManually(input: AdjustStockInput) {
  const { variantId, operation, quantity, reason, actor } = input;

  if (actor.role !== "WAREHOUSE_OPERATOR" && actor.role !== "ADMIN") {
    throw new DomainError(
      `El rol ${actor.role} no tiene permisos para modificar el inventario físico. Se requiere WAREHOUSE_OPERATOR o ADMIN.`,
      "FORBIDDEN_ROLE",
      403
    );
  }

  if (!reason || reason.trim().length < 5) {
    throw new DomainError(
      "Todo movimiento manual de inventario requiere un motivo de auditoría detallado (mínimo 5 caracteres).",
      "INVALID_REASON",
      400
    );
  }

  if (!Number.isInteger(quantity) || quantity === 0) {
    throw new DomainError(
      "La cantidad debe ser un número entero distinto de cero.",
      "INVALID_QUANTITY",
      400
    );
  }

  return withTransaction(async (tx) => {
    const invRes = await tx.query<InventoryRow & { sku: string }>(
      `SELECT i.id, i.variant_id, i.warehouse_id, i.on_hand, i.available, i.reserved, i.damaged, i.version, pv.sku
       FROM inventory_items i
       INNER JOIN product_variants pv ON pv.id = i.variant_id
       WHERE i.variant_id = $1
       FOR UPDATE OF i`,
      [variantId]
    );

    const inv = invRes.rows[0];
    if (!inv) {
      throw new DomainError("Variante de inventario no encontrada.", "NOT_FOUND", 404);
    }

    let newOnHand = inv.on_hand;
    let newAvailable = inv.available;
    const newReserved = inv.reserved;
    let newDamaged = inv.damaged;
    let movementType: MovementType = "MANUAL_ADJUSTMENT";
    let signedDelta = quantity;

    if (operation === "RESTOCK") {
      if (quantity <= 0) {
        throw new DomainError(
          "Una recepción de mercancía (RESTOCK) requiere cantidad positiva.",
          "INVALID_QUANTITY",
          400
        );
      }
      newOnHand += quantity;
      newAvailable += quantity;
      movementType = "RESTOCK";
      signedDelta = quantity;
    } else if (operation === "MARK_DAMAGED") {
      if (quantity <= 0) {
        throw new DomainError(
          "La cantidad a mover a cuarentena/dañado debe ser positiva.",
          "INVALID_QUANTITY",
          400
        );
      }
      if (inv.available < quantity) {
        throw new DomainError(
          `No hay suficiente stock libre (${inv.available}) en ${inv.sku} para mover ${quantity} uds. a stock dañado.`,
          "INSUFFICIENT_AVAILABLE_STOCK",
          409
        );
      }
      newOnHand -= quantity;
      newAvailable -= quantity;
      newDamaged += quantity;
      movementType = "MANUAL_ADJUSTMENT";
      signedDelta = -quantity;
    } else if (operation === "DISPOSE_DAMAGED") {
      if (quantity <= 0 || inv.damaged < quantity) {
        throw new DomainError(
          `No hay suficiente stock en cuarentena/dañado (${inv.damaged}) para dar de baja ${quantity} uds.`,
          "INSUFFICIENT_DAMAGED_STOCK",
          409
        );
      }
      newDamaged -= quantity;
      movementType = "MANUAL_ADJUSTMENT";
      signedDelta = -quantity;
    } else if (operation === "MANUAL_COUNT_CORRECTION") {
      // quantity can be positive (surplus found) or negative (shrinkage/loss)
      if (inv.available + quantity < 0) {
        throw new DomainError(
          `El ajuste dejaría el stock disponible en negativo (${inv.available + quantity}).`,
          "NEGATIVE_STOCK_NOT_ALLOWED",
          409
        );
      }
      newOnHand += quantity;
      newAvailable += quantity;
      movementType = "MANUAL_ADJUSTMENT";
      signedDelta = quantity;
    }

    await tx.query(
      `UPDATE inventory_items
       SET on_hand = $1,
           available = $2,
           reserved = $3,
           damaged = $4,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $5`,
      [newOnHand, newAvailable, newReserved, newDamaged, inv.id]
    );

    const ledgerId = createId("led");
    await tx.query(
      `INSERT INTO inventory_ledger (
        id, inventory_item_id, variant_id, movement_type,
        quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
        reference_type, reference_id, actor_id, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'MANUAL_OP', $10, $11, $12)`,
      [
        ledgerId,
        inv.id,
        variantId,
        movementType,
        signedDelta,
        newOnHand,
        newAvailable,
        newReserved,
        newDamaged,
        operation,
        actor.id,
        `[${operation}] ${reason.trim()}`,
      ]
    );

    return {
      variantId,
      sku: inv.sku,
      onHand: newOnHand,
      available: newAvailable,
      reserved: newReserved,
      damaged: newDamaged,
      ledgerId,
    };
  });
}

/**
 * Returns the product catalog with real-time variant stock balances.
 * Runs a lazy sweep of any expired reservations first so stock numbers are always accurate.
 */
export async function getCatalogWithStock(): Promise<ProductDTO[]> {
  await runExpireReservationsWorker();
  const db = await getDb();

  const productsRes = await db.query<{
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    image_url: string;
  }>(
    `SELECT id, slug, name, description, category, image_url
     FROM products
     WHERE is_active = TRUE
     ORDER BY created_at ASC`
  );

  const variantsRes = await db.query<{
    id: string;
    product_id: string;
    sku: string;
    name: string;
    attributes: Record<string, string>;
    price_cents: number;
    inv_id: string;
    on_hand: number;
    available: number;
    reserved: number;
    damaged: number;
    version: number;
  }>(
    `SELECT
       pv.id, pv.product_id, pv.sku, pv.name, pv.attributes, pv.price_cents,
       i.id AS inv_id, i.on_hand, i.available, i.reserved, i.damaged, i.version
     FROM product_variants pv
     INNER JOIN inventory_items i ON i.variant_id = pv.id
     ORDER BY pv.price_cents ASC`
  );

  return productsRes.rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category,
    imageUrl: p.image_url,
    variants: variantsRes.rows
      .filter((v) => v.product_id === p.id)
      .map((v) => ({
        id: v.id,
        productId: v.product_id,
        sku: v.sku,
        name: v.name,
        attributes: v.attributes || {},
        priceCents: v.price_cents,
        inventory: {
          id: v.inv_id,
          onHand: v.on_hand,
          available: v.available,
          reserved: v.reserved,
          damaged: v.damaged,
          version: v.version,
        },
      })),
  }));
}

/**
 * Returns full inventory table + immutable Kardex entries for the Backoffice.
 */
export async function getInventoryAndLedger(filters?: {
  variantId?: string;
  movementType?: string;
  limit?: number;
}) {
  await runExpireReservationsWorker();
  const db = await getDb();

  const itemsRes = await db.query<{
    inv_id: string;
    variant_id: string;
    sku: string;
    variant_name: string;
    product_name: string;
    category: string;
    price_cents: number;
    warehouse_code: string;
    on_hand: number;
    available: number;
    reserved: number;
    damaged: number;
    version: number;
    updated_at: string;
  }>(
    `SELECT
       i.id AS inv_id,
       pv.id AS variant_id,
       pv.sku,
       pv.name AS variant_name,
       p.name AS product_name,
       p.category,
       pv.price_cents,
       w.code AS warehouse_code,
       i.on_hand,
       i.available,
       i.reserved,
       i.damaged,
       i.version,
       i.updated_at::text
     FROM inventory_items i
     INNER JOIN product_variants pv ON pv.id = i.variant_id
     INNER JOIN products p ON p.id = pv.product_id
     INNER JOIN warehouses w ON w.id = i.warehouse_id
     ORDER BY p.name ASC, pv.sku ASC`
  );

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.variantId) {
    params.push(filters.variantId);
    whereClauses.push(`l.variant_id = $${params.length}`);
  }

  if (filters?.movementType) {
    params.push(filters.movementType);
    whereClauses.push(`l.movement_type = $${params.length}`);
  }

  const limit = filters?.limit ?? 100;
  params.push(limit);

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const ledgerRes = await db.query<{
    id: string;
    inventory_item_id: string;
    variant_id: string;
    sku: string;
    product_name: string;
    variant_name: string;
    movement_type: MovementType;
    quantity_delta: number;
    on_hand_after: number;
    available_after: number;
    reserved_after: number;
    damaged_after: number;
    reference_type: string;
    reference_id: string;
    actor_id: string | null;
    actor_name: string | null;
    actor_role: string | null;
    reason: string;
    created_at: string;
  }>(
    `SELECT
       l.id,
       l.inventory_item_id,
       l.variant_id,
       pv.sku,
       p.name AS product_name,
       pv.name AS variant_name,
       l.movement_type,
       l.quantity_delta,
       l.on_hand_after,
       l.available_after,
       l.reserved_after,
       l.damaged_after,
       l.reference_type,
       l.reference_id,
       l.actor_id,
       u.name AS actor_name,
       u.role AS actor_role,
       l.reason,
       l.created_at::text
     FROM inventory_ledger l
     INNER JOIN product_variants pv ON pv.id = l.variant_id
     INNER JOIN products p ON p.id = pv.product_id
     LEFT JOIN users u ON u.id = l.actor_id
     ${whereSql}
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $${params.length}`,
    params
  );

  const ledger: InventoryLedgerDTO[] = ledgerRes.rows.map((r) => ({
    id: r.id,
    inventoryItemId: r.inventory_item_id,
    variantId: r.variant_id,
    sku: r.sku,
    productName: r.product_name,
    variantName: r.variant_name,
    movementType: r.movement_type,
    quantityDelta: r.quantity_delta,
    onHandAfter: r.on_hand_after,
    availableAfter: r.available_after,
    reservedAfter: r.reserved_after,
    damagedAfter: r.damaged_after,
    referenceType: r.reference_type,
    referenceId: r.reference_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    reason: r.reason,
    createdAt: r.created_at,
  }));

  return {
    items: itemsRes.rows.map((i) => ({
      inventoryItemId: i.inv_id,
      variantId: i.variant_id,
      sku: i.sku,
      variantName: i.variant_name,
      productName: i.product_name,
      category: i.category,
      priceCents: i.price_cents,
      warehouseCode: i.warehouse_code,
      onHand: i.on_hand,
      available: i.available,
      reserved: i.reserved,
      damaged: i.damaged,
      version: i.version,
      updatedAt: i.updated_at,
    })),
    ledger,
  };
}
