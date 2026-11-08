import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDatabaseToSeed } from "@/lib/db";
import { createOrderAndReserveStock } from "@/lib/services/checkout.service";
import { processPaymentWebhook } from "@/lib/services/payment-webhook.service";
import { transitionOrderState } from "@/lib/services/order-state.service";
import { adjustStockManually } from "@/lib/services/inventory.service";
import type { SessionUser } from "@/lib/types/domain";

const customerUser: SessionUser = {
  id: "usr_customer_01",
  email: "cliente@demo.com",
  name: "Carlos Méndez",
  role: "CUSTOMER",
};

const warehouseUser: SessionUser = {
  id: "usr_warehouse_01",
  email: "almacen@demo.com",
  name: "Elena Torres",
  role: "WAREHOUSE_OPERATOR",
};

const supportUser: SessionUser = {
  id: "usr_support_01",
  email: "soporte@demo.com",
  name: "Sofía Ramírez",
  role: "SUPPORT",
};

describe("E-Commerce Strict Inventory & Order State Machine Engine (ACID)", () => {
  beforeEach(async () => {
    await resetDatabaseToSeed();
  });

  it("1. Prevents overselling under high concurrency (20 concurrent buyers competing for 3 available units)", async () => {
    const targetVariantId = "var_kb_linear_slv"; // Seeded with initialStock = 3

    // Fire 20 concurrent checkout attempts for 1 unit each
    const attempts = Array.from({ length: 20 }, (_, idx) =>
      createOrderAndReserveStock({
        customerId: customerUser.id,
        idempotencyKey: `conc_key_${idx}`,
        items: [{ variantId: targetVariantId, quantity: 1 }],
        ttlSeconds: 900,
      })
    );

    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(17);

    // Verify PostgreSQL balances and accounting equation: on_hand (3) = available (0) + reserved (3)
    const db = await getDb();
    const invRes = await db.query<{
      on_hand: number;
      available: number;
      reserved: number;
      damaged: number;
    }>(
      `SELECT on_hand, available, reserved, damaged
       FROM inventory_items
       WHERE variant_id = $1`,
      [targetVariantId]
    );

    expect(invRes.rows[0]).toEqual({
      on_hand: 3,
      available: 0,
      reserved: 3,
      damaged: 0,
    });
  });

  it("2. Enforces checkout idempotency on duplicate requests", async () => {
    const first = await createOrderAndReserveStock({
      customerId: customerUser.id,
      idempotencyKey: "idem_test_001",
      items: [{ variantId: "var_kb_tactile_blk", quantity: 2 }],
    });

    const second = await createOrderAndReserveStock({
      customerId: customerUser.id,
      idempotencyKey: "idem_test_001",
      items: [{ variantId: "var_kb_tactile_blk", quantity: 2 }],
    });

    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.order.id).toBe(first.order.id);

    // Stock should only be deducted once (12 -> 10 available, 2 reserved)
    const db = await getDb();
    const invRes = await db.query<{ available: number; reserved: number }>(
      `SELECT available, reserved FROM inventory_items WHERE variant_id = 'var_kb_tactile_blk'`
    );
    expect(invRes.rows[0]).toEqual({ available: 10, reserved: 2 });
  });

  it("3. Performs Lazy Release of expired TTL reservations when a new buyer checks out the last unit", async () => {
    const scarceVariantId = "var_mouse_white"; // Seeded with initialStock = 1

    // Buyer 1 reserves the only unit with an already-expired TTL (-10 seconds)
    const firstCheckout = await createOrderAndReserveStock({
      customerId: customerUser.id,
      idempotencyKey: "lazy_exp_1",
      items: [{ variantId: scarceVariantId, quantity: 1 }],
      ttlSeconds: -10,
    });

    // Immediately after, Buyer 2 attempts to buy the same scarce SKU before any cron runs
    const secondCheckout = await createOrderAndReserveStock({
      customerId: customerUser.id,
      idempotencyKey: "lazy_exp_2",
      items: [{ variantId: scarceVariantId, quantity: 1 }],
      ttlSeconds: 900,
    });

    expect(secondCheckout.order.status).toBe("PENDING_PAYMENT");

    // Verify first order was automatically moved to EXPIRED
    const db = await getDb();
    const firstOrderRes = await db.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1`,
      [firstCheckout.order.id]
    );
    expect(firstOrderRes.rows[0]?.status).toBe("EXPIRED");
  });

  it("4A. Handles Late Payment Webhook after TTL expiry by REACTIVATING order when free stock is still available", async () => {
    const variantId = "var_mon_34_arm"; // Seeded with initialStock = 2

    const { order } = await createOrderAndReserveStock({
      customerId: customerUser.id,
      idempotencyKey: "late_pay_ok_1",
      items: [{ variantId, quantity: 1 }],
      ttlSeconds: 900,
    });

    // Simulate TTL expiry right before webhook arrives
    const webhookRes = await processPaymentWebhook({
      eventId: "evt_late_reactivate_01",
      orderId: order.id,
      eventType: "payment_intent.succeeded",
      forceExpireFirst: true,
    });

    expect(webhookRes.outcome).toBe("LATE_PAYMENT_REACTIVATED");
    expect(webhookRes.order.status).toBe("PAID");

    const db = await getDb();
    const invRes = await db.query<{
      on_hand: number;
      available: number;
      reserved: number;
    }>(
      `SELECT on_hand, available, reserved FROM inventory_items WHERE variant_id = $1`,
      [variantId]
    );
    expect(invRes.rows[0]).toEqual({
      on_hand: 2,
      available: 1,
      reserved: 1,
    });
  });

  it("4B. Handles Late Payment Webhook after TTL expiry by routing to REFUND_PENDING when another buyer took the last unit", async () => {
    const scarceVariantId = "var_mouse_white"; // Seeded with initialStock = 1

    // Order A reserves the only unit, but its TTL expires
    const orderA = await createOrderAndReserveStock({
      customerId: customerUser.id,
      idempotencyKey: "race_order_a",
      items: [{ variantId: scarceVariantId, quantity: 1 }],
      ttlSeconds: -5,
    });

    // Order B buys the unit (triggers lazy release of Order A and claims the unit)
    const orderB = await createOrderAndReserveStock({
      customerId: customerUser.id,
      idempotencyKey: "race_order_b",
      items: [{ variantId: scarceVariantId, quantity: 1 }],
      ttlSeconds: 900,
    });
    expect(orderB.order.status).toBe("PENDING_PAYMENT");

    // Now the late payment webhook for Order A arrives!
    const lateWebhookA = await processPaymentWebhook({
      eventId: "evt_late_conflict_a",
      orderId: orderA.order.id,
      eventType: "payment_intent.succeeded",
    });

    expect(lateWebhookA.outcome).toBe(
      "LATE_PAYMENT_OUT_OF_STOCK_REFUND_PENDING"
    );
    expect(lateWebhookA.order.status).toBe("REFUND_PENDING");

    // Support then processes the refund -> REFUNDED
    const refundedOrder = await transitionOrderState({
      orderId: orderA.order.id,
      targetStatus: "REFUNDED",
      actor: supportUser,
      reason: "Reembolso automático confirmado por pago tardío sin stock",
    });
    expect(refundedOrder.status).toBe("REFUNDED");
  });

  it("5. Enforces full Order State Machine, Customer pre-picking cancellation rules, RBAC, and Return Inspection splits", async () => {
    const variantId = "var_kb_tactile_blk"; // Initial stock = 12

    // 1. Customer creates order for 2 units (available: 10, reserved: 2, on_hand: 12)
    const { order } = await createOrderAndReserveStock({
      customerId: customerUser.id,
      idempotencyKey: "lifecycle_order_01",
      items: [{ variantId, quantity: 2 }],
    });

    // 2. Payment webhook confirms order -> PAID
    await processPaymentWebhook({
      eventId: "evt_lifecycle_paid_01",
      orderId: order.id,
      eventType: "payment_intent.succeeded",
    });

    // 3. Warehouse moves PAID -> PROCESSING (Picking)
    await transitionOrderState({
      orderId: order.id,
      targetStatus: "PROCESSING",
      actor: warehouseUser,
      reason: "Picking iniciado en pasillo A",
    });

    // 4. Customer tries to cancel while in PROCESSING -> MUST FAIL with ORDER_ALREADY_PROCESSING
    await expect(
      transitionOrderState({
        orderId: order.id,
        targetStatus: "REFUND_PENDING",
        actor: customerUser,
        reason: "Quiero cancelar aunque ya esté en almacén",
      })
    ).rejects.toThrow(/ORDER_ALREADY_PROCESSING|ya está en etapa/);

    // 5. Support tries to manually adjust physical stock -> MUST FAIL with FORBIDDEN_ROLE
    await expect(
      adjustStockManually({
        variantId,
        operation: "RESTOCK",
        quantity: 10,
        reason: "Intento no autorizado desde soporte",
        actor: supportUser,
      })
    ).rejects.toThrow(/no tiene permisos/);

    // 6. Warehouse dispatches order: PROCESSING -> SHIPPED (on_hand: 12 -> 10, reserved: 2 -> 0, available: 10)
    await transitionOrderState({
      orderId: order.id,
      targetStatus: "SHIPPED",
      actor: warehouseUser,
      reason: "Enviado con guía DHL",
    });

    const db = await getDb();
    const afterShipInv = await db.query<{
      on_hand: number;
      available: number;
      reserved: number;
      damaged: number;
    }>(
      `SELECT on_hand, available, reserved, damaged FROM inventory_items WHERE variant_id = $1`,
      [variantId]
    );
    expect(afterShipInv.rows[0]).toEqual({
      on_hand: 10,
      available: 10,
      reserved: 0,
      damaged: 0,
    });

    // 7. Order is DELIVERED, then Customer requests return (RETURN_REQUESTED)
    await transitionOrderState({
      orderId: order.id,
      targetStatus: "DELIVERED",
      actor: warehouseUser,
      reason: "Entregado en domicilio",
    });

    const returnReqOrder = await transitionOrderState({
      orderId: order.id,
      targetStatus: "RETURN_REQUESTED",
      actor: customerUser,
      reason: "Solicito devolución de las 2 unidades",
    });

    // 8. Warehouse inspects the 2 returned units: 1 goes to `available` (good) and 1 goes to `damaged` (quarantine)
    const orderItemId = returnReqOrder.items[0]!.id;
    const inspectedOrder = await transitionOrderState({
      orderId: order.id,
      targetStatus: "RETURNED",
      actor: warehouseUser,
      reason: "1 unidad impecable reintegrada; 1 unidad con daño por transporte a cuarentena",
      returnInspection: [
        {
          orderItemId,
          variantId,
          toAvailableQty: 1,
          toDamagedQty: 1,
        },
      ],
    });

    expect(inspectedOrder.status).toBe("RETURNED");
    expect(inspectedOrder.items[0]?.returnedToGood).toBe(1);
    expect(inspectedOrder.items[0]?.returnedToDamaged).toBe(1);

    // Final stock must be: on_hand = 11, available = 11, reserved = 0, damaged = 1
    const afterReturnInv = await db.query<{
      on_hand: number;
      available: number;
      reserved: number;
      damaged: number;
    }>(
      `SELECT on_hand, available, reserved, damaged FROM inventory_items WHERE variant_id = $1`,
      [variantId]
    );
    expect(afterReturnInv.rows[0]).toEqual({
      on_hand: 11,
      available: 11,
      reserved: 0,
      damaged: 1,
    });
  });
});
