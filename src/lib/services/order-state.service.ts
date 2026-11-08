import type { Transaction } from "@electric-sql/pglite";
import { createId, getDb, withTransaction } from "@/lib/db";
import {
  DomainError,
  type OrderDTO,
  type OrderItemDTO,
  type OrderStateHistoryDTO,
  type OrderStatus,
  type Role,
  type SessionUser,
} from "@/lib/types/domain";
import { runExpireReservationsWorker } from "./inventory.service";

/**
 * Allowed transitions matrix and the roles permitted to trigger each transition manually.
 * (Webhook transitions like PENDING_PAYMENT -> PAID or EXPIRED -> PAID/REFUND_PENDING are handled by payment-webhook.service.ts)
 */
export const ALLOWED_TRANSITIONS: Record<
  OrderStatus,
  Partial<Record<OrderStatus, Role[]>>
> = {
  PENDING_PAYMENT: {
    CANCELLED: ["CUSTOMER", "SUPPORT", "ADMIN"],
  },
  PAID: {
    PROCESSING: ["WAREHOUSE_OPERATOR", "ADMIN"],
    REFUND_PENDING: ["CUSTOMER", "SUPPORT", "ADMIN"], // Pre-picking cancellation triggers stock release + refund queue
  },
  PROCESSING: {
    SHIPPED: ["WAREHOUSE_OPERATOR", "ADMIN"],
    REFUND_PENDING: ["SUPPORT", "ADMIN"], // Only Support/Admin can abort an in-picking order (Customer cannot!)
  },
  SHIPPED: {
    DELIVERED: ["WAREHOUSE_OPERATOR", "SUPPORT", "ADMIN", "CUSTOMER"],
  },
  DELIVERED: {
    RETURN_REQUESTED: ["CUSTOMER", "SUPPORT", "ADMIN"],
  },
  RETURN_REQUESTED: {
    RETURNED: ["WAREHOUSE_OPERATOR", "ADMIN"], // Warehouse inspects physical items and routes to available vs damaged
    DELIVERED: ["SUPPORT", "ADMIN"], // Reject return request if invalid
  },
  RETURNED: {
    REFUND_PENDING: ["WAREHOUSE_OPERATOR", "SUPPORT", "ADMIN"],
  },
  REFUND_PENDING: {
    REFUNDED: ["SUPPORT", "ADMIN"],
  },
  EXPIRED: {},
  CANCELLED: {},
  REFUNDED: {},
};

export interface ReturnInspectionItemInput {
  orderItemId: string;
  variantId: string;
  toAvailableQty: number;
  toDamagedQty: number;
}

export interface TransitionOrderInput {
  orderId: string;
  targetStatus: OrderStatus;
  actor: SessionUser;
  reason: string;
  returnInspection?: ReturnInspectionItemInput[];
}

export async function getOrderByIdInTx(
  tx: Transaction,
  orderId: string
): Promise<OrderDTO> {
  const orderRes = await tx.query<{
    id: string;
    order_number: string;
    customer_id: string;
    customer_name: string;
    customer_email: string;
    status: OrderStatus;
    total_cents: number;
    idempotency_key: string;
    reservation_expires_at: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT
       o.id, o.order_number, o.customer_id,
       u.name AS customer_name, u.email AS customer_email,
       o.status, o.total_cents, o.idempotency_key,
       o.reservation_expires_at::text, o.notes,
       o.created_at::text, o.updated_at::text
     FROM orders o
     INNER JOIN users u ON u.id = o.customer_id
     WHERE o.id = $1`,
    [orderId]
  );

  const ord = orderRes.rows[0];
  if (!ord) {
    throw new DomainError("Pedido no encontrado.", "ORDER_NOT_FOUND", 404);
  }

  const itemsRes = await tx.query<{
    id: string;
    order_id: string;
    variant_id: string;
    sku_snapshot: string;
    name_snapshot: string;
    quantity: number;
    unit_price_cents: number;
    returned_to_good: number;
    returned_to_damaged: number;
  }>(
    `SELECT
       id, order_id, variant_id, sku_snapshot, name_snapshot,
       quantity, unit_price_cents, returned_to_good, returned_to_damaged
     FROM order_items
     WHERE order_id = $1
     ORDER BY id ASC`,
    [orderId]
  );

  const historyRes = await tx.query<{
    id: string;
    order_id: string;
    from_status: OrderStatus | null;
    to_status: OrderStatus;
    actor_id: string | null;
    actor_name: string | null;
    actor_role: string;
    reason: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>(
    `SELECT
       h.id, h.order_id, h.from_status, h.to_status,
       h.actor_id, u.name AS actor_name, h.actor_role,
       h.reason, h.metadata, h.created_at::text
     FROM order_state_history h
     LEFT JOIN users u ON u.id = h.actor_id
     WHERE h.order_id = $1
     ORDER BY h.created_at ASC, h.id ASC`,
    [orderId]
  );

  const items: OrderItemDTO[] = itemsRes.rows.map((i) => ({
    id: i.id,
    orderId: i.order_id,
    variantId: i.variant_id,
    skuSnapshot: i.sku_snapshot,
    nameSnapshot: i.name_snapshot,
    quantity: i.quantity,
    unitPriceCents: i.unit_price_cents,
    returnedToGood: i.returned_to_good,
    returnedToDamaged: i.returned_to_damaged,
  }));

  const stateHistory: OrderStateHistoryDTO[] = historyRes.rows.map((h) => ({
    id: h.id,
    orderId: h.order_id,
    fromStatus: h.from_status,
    toStatus: h.to_status,
    actorId: h.actor_id,
    actorName: h.actor_name,
    actorRole: h.actor_role,
    reason: h.reason,
    metadata: h.metadata,
    createdAt: h.created_at,
  }));

  return {
    id: ord.id,
    orderNumber: ord.order_number,
    customerId: ord.customer_id,
    customerName: ord.customer_name,
    customerEmail: ord.customer_email,
    status: ord.status,
    totalCents: ord.total_cents,
    idempotencyKey: ord.idempotency_key,
    reservationExpiresAt: ord.reservation_expires_at,
    notes: ord.notes,
    createdAt: ord.created_at,
    updatedAt: ord.updated_at,
    items,
    stateHistory,
  };
}

export async function getOrders(filters?: {
  customerId?: string;
  status?: OrderStatus;
}): Promise<OrderDTO[]> {
  await runExpireReservationsWorker();
  const db = await getDb();

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (filters?.customerId) {
    params.push(filters.customerId);
    whereClauses.push(`o.customer_id = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    whereClauses.push(`o.status = $${params.length}`);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const orderIdsRes = await db.query<{ id: string }>(
    `SELECT o.id
     FROM orders o
     ${whereSql}
     ORDER BY o.created_at DESC`,
    params
  );

  return withTransaction(async (tx) => {
    const results: OrderDTO[] = [];
    for (const row of orderIdsRes.rows) {
      results.push(await getOrderByIdInTx(tx, row.id));
    }
    return results;
  });
}

/**
 * Helper to release reserved stock back to `available` when an order in PENDING_PAYMENT, PAID, or PROCESSING is cancelled/refunded prior to shipping.
 */
async function releaseOrderReservedStockInTx(
  tx: Transaction,
  orderId: string,
  orderNumber: string,
  actorId: string,
  reason: string
) {
  const itemsRes = await tx.query<{
    variant_id: string;
    quantity: number;
  }>(
    `SELECT variant_id, quantity
     FROM order_items
     WHERE order_id = $1
     ORDER BY variant_id ASC`,
    [orderId]
  );

  for (const item of itemsRes.rows) {
    const invRes = await tx.query<{
      id: string;
      on_hand: number;
      available: number;
      reserved: number;
      damaged: number;
    }>(
      `SELECT id, on_hand, available, reserved, damaged
       FROM inventory_items
       WHERE variant_id = $1
       FOR UPDATE`,
      [item.variant_id]
    );

    const inv = invRes.rows[0];
    if (!inv) continue;

    const newAvailable = inv.available + item.quantity;
    const newReserved = inv.reserved - item.quantity;

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
       SET status = 'RELEASED_CANCELLED', updated_at = NOW()
       WHERE order_id = $1 AND variant_id = $2`,
      [orderId, item.variant_id]
    );

    await tx.query(
      `INSERT INTO inventory_ledger (
        id, inventory_item_id, variant_id, movement_type,
        quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
        reference_type, reference_id, actor_id, reason
      ) VALUES ($1, $2, $3, 'RELEASE_CANCELLED', $4, $5, $6, $7, $8, 'ORDER', $9, $10, $11)`,
      [
        createId("led"),
        inv.id,
        item.variant_id,
        item.quantity,
        inv.on_hand,
        newAvailable,
        newReserved,
        inv.damaged,
        orderNumber,
        actorId,
        reason,
      ]
    );
  }
}

/**
 * Executes a strict, role-checked state transition on an Order and applies
 * the corresponding atomic inventory movements in PostgreSQL.
 */
export async function transitionOrderState(
  input: TransitionOrderInput
): Promise<OrderDTO> {
  const { orderId, targetStatus, actor, reason, returnInspection } = input;

  if (!reason || reason.trim().length < 3) {
    throw new DomainError(
      "Debes proporcionar un motivo o nota para registrar la transición de estado.",
      "INVALID_REASON",
      400
    );
  }

  return withTransaction(async (tx) => {
    const orderRes = await tx.query<{
      id: string;
      order_number: string;
      customer_id: string;
      status: OrderStatus;
    }>(
      `SELECT id, order_number, customer_id, status
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new DomainError("Pedido no encontrado.", "ORDER_NOT_FOUND", 404);
    }

    // Ownership validation if actor is CUSTOMER
    if (actor.role === "CUSTOMER" && order.customer_id !== actor.id) {
      throw new DomainError(
        "No tienes permiso para modificar un pedido de otro cliente.",
        "FORBIDDEN_ORDER_ACCESS",
        403
      );
    }

    const currentStatus = order.status;

    // Special user-friendly message when Customer tries to cancel an order already in PROCESSING / SHIPPED
    if (
      actor.role === "CUSTOMER" &&
      (targetStatus === "CANCELLED" || targetStatus === "REFUND_PENDING") &&
      (currentStatus === "PROCESSING" ||
        currentStatus === "SHIPPED" ||
        currentStatus === "DELIVERED")
    ) {
      throw new DomainError(
        `El pedido ${order.order_number} ya está en etapa '${currentStatus}' (Picking/Despacho). Los clientes solo pueden cancelar en PENDING_PAYMENT o PAID antes de entrar a almacén.`,
        "ORDER_ALREADY_PROCESSING",
        409
      );
    }

    const allowedForCurrent = ALLOWED_TRANSITIONS[currentStatus] ?? {};
    const permittedRoles = allowedForCurrent[targetStatus];

    if (!permittedRoles) {
      throw new DomainError(
        `Transición de estado inválida: no se permite pasar de '${currentStatus}' a '${targetStatus}'.`,
        "INVALID_STATE_TRANSITION",
        409,
        { fromStatus: currentStatus, toStatus: targetStatus }
      );
    }

    if (!permittedRoles.includes(actor.role)) {
      throw new DomainError(
        `El rol '${actor.role}' no tiene autorización para ejecutar la transición '${currentStatus} -> ${targetStatus}'. Roles permitidos: ${permittedRoles.join(
          ", "
        )}.`,
        "FORBIDDEN_ROLE_TRANSITION",
        403
      );
    }

    // --- Inventory Side Effects per State Transition ---

    // 1. Cancellation from PENDING_PAYMENT -> CANCELLED (releases active reservation back to available)
    if (currentStatus === "PENDING_PAYMENT" && targetStatus === "CANCELLED") {
      await releaseOrderReservedStockInTx(
        tx,
        order.id,
        order.order_number,
        actor.id,
        `Cancelación de pedido sin pagar (${order.order_number}): ${reason.trim()}`
      );
    }

    // 2. Cancellation from PAID or PROCESSING -> REFUND_PENDING (releases confirmed reservation back to available and queues refund)
    if (
      (currentStatus === "PAID" || currentStatus === "PROCESSING") &&
      targetStatus === "REFUND_PENDING"
    ) {
      await releaseOrderReservedStockInTx(
        tx,
        order.id,
        order.order_number,
        actor.id,
        `Cancelación pre-despacho con reembolso (${order.order_number}): ${reason.trim()}`
      );
    }

    // 3. Warehouse Dispatch: PROCESSING -> SHIPPED
    // Physically deducts stock from warehouse: on_hand -= qty, reserved -= qty (available remains unchanged!)
    if (currentStatus === "PROCESSING" && targetStatus === "SHIPPED") {
      const itemsRes = await tx.query<{
        variant_id: string;
        quantity: number;
      }>(
        `SELECT variant_id, quantity
         FROM order_items
         WHERE order_id = $1
         ORDER BY variant_id ASC`,
        [order.id]
      );

      for (const item of itemsRes.rows) {
        const invRes = await tx.query<{
          id: string;
          on_hand: number;
          available: number;
          reserved: number;
          damaged: number;
        }>(
          `SELECT id, on_hand, available, reserved, damaged
           FROM inventory_items
           WHERE variant_id = $1
           FOR UPDATE`,
          [item.variant_id]
        );

        const inv = invRes.rows[0];
        if (!inv) continue;

        const newOnHand = inv.on_hand - item.quantity;
        const newReserved = inv.reserved - item.quantity;

        await tx.query(
          `UPDATE inventory_items
           SET on_hand = $1,
               reserved = $2,
               version = version + 1,
               updated_at = NOW()
           WHERE id = $3`,
          [newOnHand, newReserved, inv.id]
        );

        await tx.query(
          `UPDATE stock_reservations
           SET status = 'COMMITTED', updated_at = NOW()
           WHERE order_id = $1 AND variant_id = $2`,
          [order.id, item.variant_id]
        );

        await tx.query(
          `INSERT INTO inventory_ledger (
            id, inventory_item_id, variant_id, movement_type,
            quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
            reference_type, reference_id, actor_id, reason
          ) VALUES ($1, $2, $3, 'COMMIT_SALE', $4, $5, $6, $7, $8, 'ORDER', $9, $10, $11)`,
          [
            createId("led"),
            inv.id,
            item.variant_id,
            -item.quantity,
            newOnHand,
            inv.available,
            newReserved,
            inv.damaged,
            order.order_number,
            actor.id,
            `Salida física de almacén por despacho de pedido ${order.order_number}`,
          ]
        );
      }
    }

    // 4. Warehouse Return Inspection: RETURN_REQUESTED -> RETURNED
    // Operator decides per item how many units go back to sellable `available` vs `damaged` quarantine
    if (currentStatus === "RETURN_REQUESTED" && targetStatus === "RETURNED") {
      const orderItemsRes = await tx.query<{
        id: string;
        variant_id: string;
        sku_snapshot: string;
        quantity: number;
      }>(
        `SELECT id, variant_id, sku_snapshot, quantity
         FROM order_items
         WHERE order_id = $1
         ORDER BY variant_id ASC`,
        [order.id]
      );

      for (const orderItem of orderItemsRes.rows) {
        const inspection = returnInspection?.find(
          (ri) =>
            ri.orderItemId === orderItem.id ||
            ri.variantId === orderItem.variant_id
        ) ?? {
          orderItemId: orderItem.id,
          variantId: orderItem.variant_id,
          toAvailableQty: orderItem.quantity,
          toDamagedQty: 0,
        };

        if (
          inspection.toAvailableQty < 0 ||
          inspection.toDamagedQty < 0 ||
          inspection.toAvailableQty + inspection.toDamagedQty !==
            orderItem.quantity
        ) {
          throw new DomainError(
            `La inspección de devolución para el SKU ${orderItem.sku_snapshot} debe sumar exactamente ${orderItem.quantity} unidades (recibido: ${inspection.toAvailableQty} aptas + ${inspection.toDamagedQty} dañadas).`,
            "INVALID_RETURN_INSPECTION_SPLIT",
            400
          );
        }

        const invRes = await tx.query<{
          id: string;
          on_hand: number;
          available: number;
          reserved: number;
          damaged: number;
        }>(
          `SELECT id, on_hand, available, reserved, damaged
           FROM inventory_items
           WHERE variant_id = $1
           FOR UPDATE`,
          [orderItem.variant_id]
        );

        const inv = invRes.rows[0];
        if (!inv) continue;

        let currentOnHand = inv.on_hand;
        let currentAvailable = inv.available;
        let currentDamaged = inv.damaged;

        if (inspection.toAvailableQty > 0) {
          currentOnHand += inspection.toAvailableQty;
          currentAvailable += inspection.toAvailableQty;

          await tx.query(
            `UPDATE inventory_items
             SET on_hand = $1,
                 available = $2,
                 version = version + 1,
                 updated_at = NOW()
             WHERE id = $3`,
            [currentOnHand, currentAvailable, inv.id]
          );

          await tx.query(
            `INSERT INTO inventory_ledger (
              id, inventory_item_id, variant_id, movement_type,
              quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
              reference_type, reference_id, actor_id, reason
            ) VALUES ($1, $2, $3, 'RETURN_TO_AVAILABLE', $4, $5, $6, $7, $8, 'RETURN', $9, $10, $11)`,
            [
              createId("led"),
              inv.id,
              orderItem.variant_id,
              inspection.toAvailableQty,
              currentOnHand,
              currentAvailable,
              inv.reserved,
              currentDamaged,
              order.order_number,
              actor.id,
              `Devolución inspeccionada APTA reintegrada a stock disponible (${order.order_number}): ${reason.trim()}`,
            ]
          );
        }

        if (inspection.toDamagedQty > 0) {
          currentDamaged += inspection.toDamagedQty;

          await tx.query(
            `UPDATE inventory_items
             SET damaged = $1,
                 version = version + 1,
                 updated_at = NOW()
             WHERE id = $2`,
            [currentDamaged, inv.id]
          );

          await tx.query(
            `INSERT INTO inventory_ledger (
              id, inventory_item_id, variant_id, movement_type,
              quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
              reference_type, reference_id, actor_id, reason
            ) VALUES ($1, $2, $3, 'RETURN_TO_DAMAGED', $4, $5, $6, $7, $8, 'RETURN', $9, $10, $11)`,
            [
              createId("led"),
              inv.id,
              orderItem.variant_id,
              inspection.toDamagedQty,
              currentOnHand,
              currentAvailable,
              inv.reserved,
              currentDamaged,
              order.order_number,
              actor.id,
              `Devolución inspeccionada DAÑADA enviada a cuarentena/merma (${order.order_number}): ${reason.trim()}`,
            ]
          );
        }

        await tx.query(
          `UPDATE order_items
           SET returned_to_good = $1,
               returned_to_damaged = $2
           WHERE id = $3`,
          [inspection.toAvailableQty, inspection.toDamagedQty, orderItem.id]
        );
      }
    }

    // Update Order status
    await tx.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [targetStatus, order.id]
    );

    await tx.query(
      `INSERT INTO order_state_history (
        id, order_id, from_status, to_status, actor_id, actor_role, reason, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        createId("osh"),
        order.id,
        currentStatus,
        targetStatus,
        actor.id,
        actor.role,
        reason.trim(),
        returnInspection ? JSON.stringify({ returnInspection }) : null,
      ]
    );

    return getOrderByIdInTx(tx, order.id);
  });
}
