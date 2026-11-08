import { createId, withTransaction } from "@/lib/db";
import { DomainError, type OrderDTO, type OrderStatus } from "@/lib/types/domain";
import { getOrderByIdInTx } from "./order-state.service";

export type PaymentWebhookEventType =
  | "payment_intent.succeeded"
  | "payment_intent.payment_failed";

export interface ProcessPaymentWebhookInput {
  eventId: string;
  orderId: string;
  eventType: PaymentWebhookEventType;
  forceExpireFirst?: boolean; // Helper for live portfolio demonstration of late-webhook race condition
}

export interface PaymentWebhookResult {
  order: OrderDTO;
  outcome:
    | "PAID_ON_TIME"
    | "LATE_PAYMENT_REACTIVATED"
    | "LATE_PAYMENT_OUT_OF_STOCK_REFUND_PENDING"
    | "PAYMENT_FAILED_RELEASED"
    | "IDEMPOTENT_IGNORED";
  message: string;
}

/**
 * Processes an incoming payment gateway webhook with strict idempotency (`payment_events`)
 * and deterministic handling of the Late Payment Webhook vs. TTL Expiration race condition.
 */
export async function processPaymentWebhook(
  input: ProcessPaymentWebhookInput
): Promise<PaymentWebhookResult> {
  const { eventId, orderId, eventType, forceExpireFirst } = input;

  if (!eventId || eventId.trim().length < 3) {
    throw new DomainError(
      "El webhook requiere un identificador único de evento (eventId).",
      "INVALID_EVENT_ID",
      400
    );
  }

  return withTransaction(async (tx) => {
    // 1. Idempotency check: has this webhook eventId already been processed?
    const existingEventRes = await tx.query<{
      id: string;
      outcome: string;
    }>(`SELECT id, outcome FROM payment_events WHERE event_id = $1`, [eventId]);

    if (existingEventRes.rows[0]) {
      const order = await getOrderByIdInTx(tx, orderId);
      return {
        order,
        outcome: "IDEMPOTENT_IGNORED",
        message: `Evento de webhook ${eventId} ya fue procesado previamente (${existingEventRes.rows[0].outcome}).`,
      };
    }

    // Optional helper for interactive demo: expire the reservation right before processing the late webhook
    if (forceExpireFirst) {
      await tx.query(
        `UPDATE stock_reservations
         SET expires_at = NOW() - INTERVAL '1 minute'
         WHERE order_id = $1 AND status = 'ACTIVE'`,
        [orderId]
      );
      const { releaseExpiredReservationsInTx } = await import(
        "./inventory.service"
      );
      await releaseExpiredReservationsInTx(tx, { skipLocked: false });
    }

    // 2. Lock the target order row
    const orderRes = await tx.query<{
      id: string;
      order_number: string;
      status: OrderStatus;
      customer_id: string;
    }>(
      `SELECT id, order_number, status, customer_id
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    const order = orderRes.rows[0];
    if (!order) {
      throw new DomainError("Pedido no encontrado.", "ORDER_NOT_FOUND", 404);
    }

    let outcome: PaymentWebhookResult["outcome"] = "IDEMPOTENT_IGNORED";
    let message = "";

    // CASE A: Payment Failed
    if (eventType === "payment_intent.payment_failed") {
      if (order.status === "PENDING_PAYMENT") {
        // Release active reservation back to available and cancel order
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
            [order.id, item.variant_id]
          );

          await tx.query(
            `INSERT INTO inventory_ledger (
              id, inventory_item_id, variant_id, movement_type,
              quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
              reference_type, reference_id, actor_id, reason
            ) VALUES ($1, $2, $3, 'RELEASE_CANCELLED', $4, $5, $6, $7, $8, 'WEBHOOK', $9, NULL, $10)`,
            [
              createId("led"),
              inv.id,
              item.variant_id,
              item.quantity,
              inv.on_hand,
              newAvailable,
              newReserved,
              inv.damaged,
              order.order_number,
              `Pago rechazado por pasarela en pedido ${order.order_number}; stock liberado`,
            ]
          );
        }

        await tx.query(
          `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
          [order.id]
        );

        await tx.query(
          `INSERT INTO order_state_history (
            id, order_id, from_status, to_status, actor_id, actor_role, reason, metadata
          ) VALUES ($1, $2, 'PENDING_PAYMENT', 'CANCELLED', NULL, 'PAYMENT_WEBHOOK', $3, $4::jsonb)`,
          [
            createId("osh"),
            order.id,
            `Webhook ${eventId}: Pago rechazado por el banco/pasarela; reserva liberada`,
            JSON.stringify({ eventId, eventType }),
          ]
        );

        outcome = "PAYMENT_FAILED_RELEASED";
        message = `Pago fallido procesado. La reserva del pedido ${order.order_number} fue liberada inmediatamente.`;
      } else {
        outcome = "IDEMPOTENT_IGNORED";
        message = `El pedido ${order.order_number} ya estaba en estado ${order.status}.`;
      }
    }

    // CASE B: Payment Succeeded while order is still in PENDING_PAYMENT
    else if (
      eventType === "payment_intent.succeeded" &&
      order.status === "PENDING_PAYMENT"
    ) {
      await tx.query(
        `UPDATE stock_reservations
         SET status = 'CONFIRMED', updated_at = NOW()
         WHERE order_id = $1 AND status = 'ACTIVE'`,
        [order.id]
      );

      await tx.query(
        `UPDATE orders
         SET status = 'PAID', updated_at = NOW()
         WHERE id = $1`,
        [order.id]
      );

      await tx.query(
        `INSERT INTO order_state_history (
          id, order_id, from_status, to_status, actor_id, actor_role, reason, metadata
        ) VALUES ($1, $2, 'PENDING_PAYMENT', 'PAID', NULL, 'PAYMENT_WEBHOOK', $3, $4::jsonb)`,
        [
          createId("osh"),
          order.id,
          `Webhook ${eventId}: Pago confirmado dentro de la ventana TTL. Reserva asegurada para almacén.`,
          JSON.stringify({ eventId, eventType }),
        ]
      );

      outcome = "PAID_ON_TIME";
      message = `Pago confirmado exitosamente para el pedido ${order.order_number}.`;
    }

    // CASE C: Late Payment Race Condition!
    // Order already transitioned to EXPIRED (and its reservation was released),
    // but the payment gateway confirms the user's charge succeeded milliseconds later.
    else if (
      eventType === "payment_intent.succeeded" &&
      order.status === "EXPIRED"
    ) {
      const itemsRes = await tx.query<{
        variant_id: string;
        sku_snapshot: string;
        quantity: number;
      }>(
        `SELECT variant_id, sku_snapshot, quantity
         FROM order_items
         WHERE order_id = $1
         ORDER BY variant_id ASC`,
        [order.id]
      );

      const variantIds = itemsRes.rows.map((r) => r.variant_id);
      const lockedInvRes = await tx.query<{
        id: string;
        variant_id: string;
        on_hand: number;
        available: number;
        reserved: number;
        damaged: number;
      }>(
        `SELECT id, variant_id, on_hand, available, reserved, damaged
         FROM inventory_items
         WHERE variant_id = ANY($1::text[])
         ORDER BY variant_id ASC
         FOR UPDATE`,
        [variantIds]
      );

      const invMap = new Map(lockedInvRes.rows.map((i) => [i.variant_id, i]));
      let canFulfillAll = true;
      const missingSkus: string[] = [];

      for (const item of itemsRes.rows) {
        const inv = invMap.get(item.variant_id);
        if (!inv || inv.available < item.quantity) {
          canFulfillAll = false;
          missingSkus.push(
            `${item.sku_snapshot} (req: ${item.quantity}, disp: ${
              inv?.available ?? 0
            })`
          );
        }
      }

      if (canFulfillAll) {
        // Re-claim stock from `available` -> `reserved` and reactivate order to PAID
        for (const item of itemsRes.rows) {
          const inv = invMap.get(item.variant_id)!;
          const newAvailable = inv.available - item.quantity;
          const newReserved = inv.reserved + item.quantity;

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
             SET status = 'CONFIRMED', updated_at = NOW()
             WHERE order_id = $1 AND variant_id = $2`,
            [order.id, item.variant_id]
          );

          await tx.query(
            `INSERT INTO inventory_ledger (
              id, inventory_item_id, variant_id, movement_type,
              quantity_delta, on_hand_after, available_after, reserved_after, damaged_after,
              reference_type, reference_id, actor_id, reason
            ) VALUES ($1, $2, $3, 'RESERVE', $4, $5, $6, $7, $8, 'LATE_WEBHOOK', $9, NULL, $10)`,
            [
              createId("led"),
              inv.id,
              item.variant_id,
              -item.quantity,
              inv.on_hand,
              newAvailable,
              newReserved,
              inv.damaged,
              order.order_number,
              `Reactivación automática por webhook de pago tardío (${eventId}) con stock libre disponible`,
            ]
          );
        }

        await tx.query(
          `UPDATE orders
           SET status = 'PAID', updated_at = NOW()
           WHERE id = $1`,
          [order.id]
        );

        await tx.query(
          `INSERT INTO order_state_history (
            id, order_id, from_status, to_status, actor_id, actor_role, reason, metadata
          ) VALUES ($1, $2, 'EXPIRED', 'PAID', NULL, 'PAYMENT_WEBHOOK', $3, $4::jsonb)`,
          [
            createId("osh"),
            order.id,
            `Webhook tardío (${eventId}) recibido tras expiración de TTL. Stock libre verificado y re-reservado exitosamente.`,
            JSON.stringify({ eventId, lateWebhook: true, reReserved: true }),
          ]
        );

        outcome = "LATE_PAYMENT_REACTIVATED";
        message = `Pago tardío recibido tras expirar el TTL: como aún había stock disponible, el pedido ${order.order_number} fue reactivado a PAID automáticamente.`;
      } else {
        // Another buyer took the stock after TTL expired -> Move to REFUND_PENDING + Alert Support
        await tx.query(
          `UPDATE orders
           SET status = 'REFUND_PENDING',
               notes = COALESCE(notes || ' | ', '') || $2,
               updated_at = NOW()
           WHERE id = $1`,
          [
            order.id,
            `[ALERTA SOPORTE] Pago tardío (${eventId}) recibido post-TTL sin stock libre (${missingSkus.join(
              ", "
            )}). Reembolso automático requerido.`,
          ]
        );

        await tx.query(
          `INSERT INTO order_state_history (
            id, order_id, from_status, to_status, actor_id, actor_role, reason, metadata
          ) VALUES ($1, $2, 'EXPIRED', 'REFUND_PENDING', NULL, 'PAYMENT_WEBHOOK', $3, $4::jsonb)`,
          [
            createId("osh"),
            order.id,
            `ALERTA DE CONCURRENCIA: Webhook de pago tardío (${eventId}) llegó después de expirar el TTL y el stock ya fue adquirido por otro cliente (${missingSkus.join(
              ", "
            )}). Orden enviada a REFUND_PENDING.`,
            JSON.stringify({
              eventId,
              lateWebhook: true,
              reReserved: false,
              missingSkus,
            }),
          ]
        );

        outcome = "LATE_PAYMENT_OUT_OF_STOCK_REFUND_PENDING";
        message = `Pago tardío detectado tras vencimiento de TTL, pero el stock ya fue comprado por otro usuario (${missingSkus.join(
          ", "
        )}). El pedido ${
          order.order_number
        } pasó a REFUND_PENDING para reembolso inmediato sin generar sobreventa.`;
      }
    } else {
      outcome = "IDEMPOTENT_IGNORED";
      message = `El pedido ${order.order_number} se encuentra en estado ${order.status}; no se aplicaron cambios.`;
    }

    // 3. Record processed webhook event for idempotency
    await tx.query(
      `INSERT INTO payment_events (id, event_id, order_id, event_type, outcome, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        createId("pe"),
        eventId,
        order.id,
        eventType,
        outcome,
        JSON.stringify({ eventId, orderId, eventType, outcome, message }),
      ]
    );

    const updatedOrder = await getOrderByIdInTx(tx, order.id);
    return {
      order: updatedOrder,
      outcome,
      message,
    };
  });
}
