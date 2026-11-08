import { createId, withTransaction } from "@/lib/db";
import { DomainError, type OrderDTO } from "@/lib/types/domain";
import { releaseExpiredReservationsInTx } from "./inventory.service";
import { getOrderByIdInTx } from "./order-state.service";

export interface CheckoutItemInput {
  variantId: string;
  quantity: number;
}

export interface CreateOrderCheckoutInput {
  customerId: string;
  items: CheckoutItemInput[];
  idempotencyKey: string;
  ttlSeconds?: number; // Default: 900 seconds (15 minutes)
  notes?: string;
}

/**
 * Atomically creates an order in PENDING_PAYMENT and reserves stock with a strict TTL.
 *
 * Concurrency & Anti-Overselling Guarantees:
 * 1. Idempotency check on `idempotencyKey` prevents duplicate orders on retries/double-clicks.
 * 2. Sorts requested `variantId`s lexicographically before locking to prevent deadlocks.
 * 3. Runs Lazy Expiration (`releaseExpiredReservationsInTx`) on the requested SKUs so any
 *    abandoned checkout whose TTL just elapsed immediately frees its stock for this buyer.
 * 4. Locks `inventory_items` rows with `SELECT ... FOR UPDATE`.
 * 5. Verifies `available >= quantity` for every item; rolls back entire transaction if any SKU fails.
 * 6. Updates `available = available - qty`, `reserved = reserved + qty` and appends `RESERVE`
 *    entries to the immutable `inventory_ledger`.
 */
export async function createOrderAndReserveStock(
  input: CreateOrderCheckoutInput
): Promise<{ order: OrderDTO; idempotentReplay: boolean }> {
  const { customerId, items, idempotencyKey, ttlSeconds = 900, notes } = input;

  if (!idempotencyKey || idempotencyKey.trim().length < 4) {
    throw new DomainError(
      "Se requiere una clave de idempotencia válida (idempotencyKey).",
      "INVALID_IDEMPOTENCY_KEY",
      400
    );
  }

  if (!items || items.length === 0) {
    throw new DomainError(
      "El carrito no puede estar vacío.",
      "EMPTY_CART",
      400
    );
  }

  // Consolidate duplicate variantIds if any and validate positive integers
  const consolidatedMap = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new DomainError(
        `Cantidad inválida (${item.quantity}) para la variante ${item.variantId}.`,
        "INVALID_QUANTITY",
        400
      );
    }
    consolidatedMap.set(
      item.variantId,
      (consolidatedMap.get(item.variantId) ?? 0) + item.quantity
    );
  }

  // Sort variantIds deterministically to prevent deadlocks across multi-item checkouts
  const sortedVariantIds = Array.from(consolidatedMap.keys()).sort();

  return withTransaction(async (tx) => {
    // 1. Check idempotency key first
    const existingOrderRes = await tx.query<{ id: string }>(
      `SELECT id FROM orders WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existingOrderRes.rows[0]) {
      const existingOrder = await getOrderByIdInTx(
        tx,
        existingOrderRes.rows[0].id
      );
      return { order: existingOrder, idempotentReplay: true };
    }

    // 2. Lazy Release: reclaim any expired reservations on the requested SKUs before locking balances
    await releaseExpiredReservationsInTx(tx, {
      variantIds: sortedVariantIds,
      skipLocked: false,
    });

    // 3. Acquire pessimistic row-level locks in deterministic variant_id order
    const lockedStockRes = await tx.query<{
      inv_id: string;
      variant_id: string;
      sku: string;
      variant_name: string;
      product_name: string;
      price_cents: number;
      on_hand: number;
      available: number;
      reserved: number;
      damaged: number;
    }>(
      `SELECT
         i.id AS inv_id,
         i.variant_id,
         pv.sku,
         pv.name AS variant_name,
         p.name AS product_name,
         pv.price_cents,
         i.on_hand,
         i.available,
         i.reserved,
         i.damaged
       FROM inventory_items i
       INNER JOIN product_variants pv ON pv.id = i.variant_id
       INNER JOIN products p ON p.id = pv.product_id
       WHERE i.variant_id = ANY($1::text[])
       ORDER BY i.variant_id ASC
       FOR UPDATE OF i`,
      [sortedVariantIds]
    );

    if (lockedStockRes.rows.length !== sortedVariantIds.length) {
      throw new DomainError(
        "Uno o más SKUs solicitados no existen en el catálogo.",
        "SKU_NOT_FOUND",
        404
      );
    }

    // 4. Verify sufficient `available` stock for all items
    for (const row of lockedStockRes.rows) {
      const requestedQty = consolidatedMap.get(row.variant_id) ?? 0;
      if (row.available < requestedQty) {
        throw new DomainError(
          `Stock insuficiente para "${row.product_name} (${row.sku})". Solicitado: ${requestedQty}, Disponible: ${row.available}.`,
          "INSUFFICIENT_STOCK",
          409,
          {
            variantId: row.variant_id,
            sku: row.sku,
            requested: requestedQty,
            available: row.available,
            reserved: row.reserved,
          }
        );
      }
    }

    // 5. Compute order totals and create Order header
    let totalCents = 0;
    for (const row of lockedStockRes.rows) {
      const qty = consolidatedMap.get(row.variant_id)!;
      totalCents += row.price_cents * qty;
    }

    const orderId = createId("ord");
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(
      100 + Math.random() * 900
    )}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await tx.query(
      `INSERT INTO orders (
        id, order_number, customer_id, status, total_cents,
        idempotency_key, reservation_expires_at, notes
      ) VALUES ($1, $2, $3, 'PENDING_PAYMENT', $4, $5, $6::timestamptz, $7)`,
      [
        orderId,
        orderNumber,
        customerId,
        totalCents,
        idempotencyKey,
        expiresAt,
        notes ?? null,
      ]
    );

    // 6. Deduct `available`, increase `reserved`, create OrderItems, StockReservations & Ledger entries
    for (const row of lockedStockRes.rows) {
      const qty = consolidatedMap.get(row.variant_id)!;
      const newAvailable = row.available - qty;
      const newReserved = row.reserved + qty;

      await tx.query(
        `UPDATE inventory_items
         SET available = $1,
             reserved = $2,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $3`,
        [newAvailable, newReserved, row.inv_id]
      );

      await tx.query(
        `INSERT INTO order_items (
          id, order_id, variant_id, sku_snapshot, name_snapshot, quantity, unit_price_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          createId("oi"),
          orderId,
          row.variant_id,
          row.sku,
          `${row.product_name} — ${row.variant_name}`,
          qty,
          row.price_cents,
        ]
      );

      await tx.query(
        `INSERT INTO stock_reservations (
          id, order_id, variant_id, quantity, status, expires_at
        ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5::timestamptz)`,
        [createId("res"), orderId, row.variant_id, qty, expiresAt]
      );

      await tx.query(
        `INSERT INTO inventory_ledger (
          id, inventory_item_id, variant_id, movement_type,
          quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
          reference_type, reference_id, actor_id, reason
        ) VALUES ($1, $2, $3, 'RESERVE', $4, $5, $6, $7, $8, 'ORDER', $9, $10, $11)`,
        [
          createId("led"),
          row.inv_id,
          row.variant_id,
          -qty,
          row.on_hand,
          newAvailable,
          newReserved,
          row.damaged,
          orderNumber,
          customerId,
          `Reserva temporal en checkout para pedido ${orderNumber} (TTL ${Math.round(
            ttlSeconds / 60
          )} min)`,
        ]
      );
    }

    // 7. Record initial state in OrderStateHistory
    await tx.query(
      `INSERT INTO order_state_history (
        id, order_id, from_status, to_status, actor_id, actor_role, reason, metadata
      ) VALUES ($1, $2, NULL, 'PENDING_PAYMENT', $3, 'CUSTOMER', $4, $5::jsonb)`,
      [
        createId("osh"),
        orderId,
        customerId,
        `Checkout iniciado con reserva de inventario activa hasta ${expiresAt}`,
        JSON.stringify({ ttlSeconds, itemCount: lockedStockRes.rows.length }),
      ]
    );

    const createdOrder = await getOrderByIdInTx(tx, orderId);
    return { order: createdOrder, idempotentReplay: false };
  });
}
