"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import {
  formatCurrency,
  MovementBadge,
  OrderStatusBadge,
  RoleBadge,
} from "@/components/StatusBadge";
import type {
  InventoryLedgerDTO,
  MovementType,
  OrderDTO,
  OrderStatus,
  SessionUser,
} from "@/lib/types/domain";
import type { StockAdjustmentOperation } from "@/lib/services/inventory.service";

interface InventoryItemOverview {
  inventoryItemId: string;
  variantId: string;
  sku: string;
  variantName: string;
  productName: string;
  category: string;
  priceCents: number;
  warehouseCode: string;
  onHand: number;
  available: number;
  reserved: number;
  damaged: number;
  version: number;
  updatedAt: string;
}

export default function AdminBackofficePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeTab, setActiveTab] = useState<"orders" | "inventory" | "ledger">(
    "orders"
  );
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOverview[]>(
    []
  );
  const [ledger, setLedger] = useState<InventoryLedgerDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Filters
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("ALL");
  const [ledgerSkuFilter, setLedgerSkuFilter] = useState<string>("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>("");

  // Warehouse Stock Adjustment Modal State
  const [adjustModalItem, setAdjustModalItem] =
    useState<InventoryItemOverview | null>(null);
  const [adjustOp, setAdjustOp] = useState<StockAdjustmentOperation>("RESTOCK");
  const [adjustQty, setAdjustQty] = useState<number>(5);
  const [adjustReason, setAdjustReason] = useState<string>(
    "Recepción de lote de proveedor #PO-2026"
  );
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  // Warehouse Return Inspection Modal State
  const [inspectModalOrder, setInspectModalOrder] = useState<OrderDTO | null>(
    null
  );
  const [inspectionSplits, setInspectionSplits] = useState<
    Record<string, { toAvailableQty: number; toDamagedQty: number }>
  >({});
  const [inspectReason, setInspectReason] = useState<string>(
    "Inspección física completada en recepción de almacén"
  );
  const [inspectSubmitting, setInspectSubmitting] = useState(false);

  const loadBackofficeData = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      const currentUser: SessionUser | null = meData.user ?? null;
      setUser(currentUser);

      if (currentUser && currentUser.role !== "CUSTOMER") {
        const [ordRes, invRes] = await Promise.all([
          fetch("/api/orders"),
          fetch("/api/inventory"),
        ]);
        const ordData = await ordRes.json();
        const invData = await invRes.json();

        setOrders(ordData.orders ?? []);
        setInventoryItems(invData.items ?? []);
        setLedger(invData.ledger ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackofficeData();
  }, [loadBackofficeData]);

  const canModifyPhysicalStock =
    user?.role === "WAREHOUSE_OPERATOR" || user?.role === "ADMIN";
  const canProcessRefunds = user?.role === "SUPPORT" || user?.role === "ADMIN";

  const handleTransitionOrder = async (
    orderId: string,
    targetStatus: OrderStatus,
    reason: string,
    returnInspection?: {
      orderItemId: string;
      variantId: string;
      toAvailableQty: number;
      toDamagedQty: number;
    }[]
  ) => {
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStatus,
          reason,
          returnInspection,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "No se pudo cambiar el estado del pedido.",
        });
        return false;
      }
      setStatusMessage({
        type: "success",
        text: `El pedido ${data.order.orderNumber} pasó al estado ${data.order.status}.`,
      });
      await loadBackofficeData();
      return true;
    } catch {
      setStatusMessage({
        type: "error",
        text: "No se pudo conectar con el servidor.",
      });
      return false;
    }
  };

  const openInspectionModal = (order: OrderDTO) => {
    const initialSplits: Record<
      string,
      { toAvailableQty: number; toDamagedQty: number }
    > = {};
    for (const item of order.items) {
      initialSplits[item.id] = {
        toAvailableQty: item.quantity,
        toDamagedQty: 0,
      };
    }
    setInspectionSplits(initialSplits);
    setInspectModalOrder(order);
  };

  const submitReturnInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectModalOrder) return;
    setInspectSubmitting(true);

    const payload = inspectModalOrder.items.map((item) => {
      const split = inspectionSplits[item.id] ?? {
        toAvailableQty: item.quantity,
        toDamagedQty: 0,
      };
      return {
        orderItemId: item.id,
        variantId: item.variantId,
        toAvailableQty: split.toAvailableQty,
        toDamagedQty: split.toDamagedQty,
      };
    });

    const ok = await handleTransitionOrder(
      inspectModalOrder.id,
      "RETURNED",
      inspectReason,
      payload
    );
    setInspectSubmitting(false);
    if (ok) {
      setInspectModalOrder(null);
    }
  };

  const submitManualAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalItem) return;
    setAdjustSubmitting(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: adjustModalItem.variantId,
          operation: adjustOp,
          quantity: Number(adjustQty),
          reason: adjustReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "No se pudo registrar el ajuste de inventario.",
        });
        setAdjustSubmitting(false);
        return;
      }
      setStatusMessage({
        type: "success",
        text: `Ajuste registrado en ${data.result.sku}. En almacén: ${data.result.onHand}, disponibles: ${data.result.available}, en cuarentena: ${data.result.damaged}.`,
      });
      setAdjustModalItem(null);
      await loadBackofficeData();
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleRunExpiryWorker = async () => {
    const res = await fetch("/api/cron/expire-reservations", {
      method: "POST",
    });
    const data = await res.json();
    setStatusMessage({
      type: "info",
      text: `Revisión completada: ${
        data.expiredOrderIds?.length ?? 0
      } reservas vencidas liberadas (${
        data.releasedUnits ?? 0
      } unidades devueltas a disponibles).`,
    });
    await loadBackofficeData();
  };

  const handleResetDemo = async () => {
    if (
      !window.confirm(
        "¿Deseas restaurar la base de datos a los valores iniciales de demostración?"
      )
    ) {
      return;
    }
    const res = await fetch("/api/demo/reset", { method: "POST" });
    const data = await res.json();
    setStatusMessage({
      type: "info",
      text: data.message || "Datos iniciales restaurados.",
    });
    await loadBackofficeData();
  };

  // Global metrics
  const totalOnHand = inventoryItems.reduce((s, i) => s + i.onHand, 0);
  const totalAvailable = inventoryItems.reduce((s, i) => s + i.available, 0);
  const totalReserved = inventoryItems.reduce((s, i) => s + i.reserved, 0);
  const totalDamaged = inventoryItems.reduce((s, i) => s + i.damaged, 0);
  const isBalanceEquationValid = totalOnHand === totalAvailable + totalReserved;

  const filteredOrders =
    orderStatusFilter === "ALL"
      ? orders
      : orders.filter((o) => o.status === orderStatusFilter);

  const filteredLedger = ledger.filter((entry) => {
    if (ledgerSkuFilter && entry.variantId !== ledgerSkuFilter) return false;
    if (ledgerTypeFilter && entry.movementType !== ledgerTypeFilter)
      return false;
    return true;
  });

  if (!loading && (!user || user.role === "CUSTOMER")) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar user={user} onUserChange={setUser} />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 space-y-4">
          <div className="bg-white rounded border border-[#DDDCDA] p-8 space-y-3">
            <h1 className="text-xl font-bold text-[#141517]">
              Panel exclusivo para personal de operaciones
            </h1>
            <p className="text-xs text-[#52555A] leading-relaxed">
              Has iniciado sesión como{" "}
              <strong className="text-[#141517]">
                {user ? user.name : "visitante"}
              </strong>
              . Para gestionar almacén, pedidos o reembolsos, cambia a un perfil
              de operador de almacén, atención al cliente o administrador.
            </p>
            <Link
              href="/login"
              className="inline-block px-4 py-2 rounded bg-[#141517] text-white text-xs font-medium"
            >
              Cambiar de cuenta
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} onUserChange={setUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="pb-6 border-b border-[#DDDCDA] flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#141517]">
                Panel de operaciones e inventario
              </h1>
              {user && <RoleBadge role={user.role} />}
            </div>
            <p className="text-sm text-[#52555A] mt-1 max-w-[68ch]">
              {user?.role === "WAREHOUSE_OPERATOR" &&
                "Prepara y envía pedidos pagados, inspecciona devoluciones recibidas y registra entradas o ajustes de almacén."}
              {user?.role === "SUPPORT" &&
                "Atiende avisos de pagos tardíos, ejecuta reembolsos y cancela pedidos en preparación. El ajuste de stock físico está reservado al personal de almacén."}
              {user?.role === "ADMIN" &&
                "Acceso completo a preparación de pedidos, almacén, reembolsos y registro contable de movimientos."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunExpiryWorker}
              className="px-3 py-1.5 rounded bg-white hover:bg-[#EBEAE4] text-[#141517] border border-[#DDDCDA] text-xs font-medium cursor-pointer"
            >
              Liberar reservas vencidas
            </button>

            {user?.role === "ADMIN" && (
              <button
                onClick={handleResetDemo}
                className="px-3 py-1.5 rounded bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 text-xs font-medium cursor-pointer"
              >
                Restaurar datos iniciales
              </button>
            )}

            <button
              onClick={loadBackofficeData}
              className="px-3 py-1.5 rounded bg-[#141517] hover:bg-[#2A2C30] text-white text-xs font-medium cursor-pointer"
            >
              Actualizar datos
            </button>
          </div>
        </div>

        {/* Summary Figures */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded border border-[#DDDCDA] p-4">
            <span className="text-xs text-[#52555A] block">
              En almacén (físico apto)
            </span>
            <div className="text-2xl font-bold font-mono text-[#141517] mt-1">
              {totalOnHand}
            </div>
          </div>

          <div className="bg-white rounded border border-[#DDDCDA] p-4">
            <span className="text-xs text-[#52555A] block">
              Disponibles para venta
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">
              {totalAvailable}
            </div>
          </div>

          <div className="bg-white rounded border border-[#DDDCDA] p-4">
            <span className="text-xs text-[#52555A] block">
              Apartadas en reserva
            </span>
            <div className="text-2xl font-bold font-mono text-amber-800 mt-1">
              {totalReserved}
            </div>
          </div>

          <div className="bg-white rounded border border-[#DDDCDA] p-4">
            <span className="text-xs text-[#52555A] block">
              En cuarentena por daño
            </span>
            <div className="text-2xl font-bold font-mono text-rose-800 mt-1">
              {totalDamaged}
            </div>
          </div>

          <div
            className={`rounded border p-4 col-span-2 lg:col-span-1 ${
              isBalanceEquationValid
                ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                : "bg-rose-50 border-rose-300 text-rose-950"
            }`}
          >
            <span className="text-xs font-medium block">
              Cuadre de inventario
            </span>
            <div className="text-lg font-mono font-bold mt-1">
              {totalOnHand} = {totalAvailable} + {totalReserved}
            </div>
            <span className="text-[11px] opacity-80 block">
              Físico = Disponibles + En reserva
            </span>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`p-4 rounded border text-xs flex items-center justify-between ${
              statusMessage.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                : statusMessage.type === "error"
                ? "bg-rose-50 border-rose-300 text-rose-950"
                : "bg-blue-50 border-blue-300 text-blue-950"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="underline ml-4 cursor-pointer"
            >
              Ocultar
            </button>
          </div>
        )}

        {/* Section Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-[#DDDCDA] pb-3">
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2 rounded text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "orders"
                ? "bg-[#141517] text-white"
                : "bg-white text-[#52555A] border border-[#DDDCDA] hover:text-[#141517]"
            }`}
          >
            Pedidos y estados ({orders.length})
          </button>

          <button
            onClick={() => setActiveTab("inventory")}
            className={`px-4 py-2 rounded text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "inventory"
                ? "bg-[#141517] text-white"
                : "bg-white text-[#52555A] border border-[#DDDCDA] hover:text-[#141517]"
            }`}
          >
            Saldos de inventario por modelo ({inventoryItems.length})
          </button>

          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-4 py-2 rounded text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "ledger"
                ? "bg-[#141517] text-white"
                : "bg-white text-[#52555A] border border-[#DDDCDA] hover:text-[#141517]"
            }`}
          >
            Registro contable de movimientos ({ledger.length})
          </button>
        </div>

        {/* TAB: ORDERS */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5 bg-white p-3 rounded border border-[#DDDCDA]">
              {[
                { key: "ALL", label: "Todos" },
                { key: "PENDING_PAYMENT", label: "Reserva activa" },
                { key: "PAID", label: "Pagados" },
                { key: "PROCESSING", label: "En preparación" },
                { key: "SHIPPED", label: "Enviados" },
                { key: "DELIVERED", label: "Entregados" },
                { key: "RETURN_REQUESTED", label: "Devolución solicitada" },
                { key: "RETURNED", label: "Inspeccionados" },
                { key: "REFUND_PENDING", label: "Reembolso pendiente" },
                { key: "REFUNDED", label: "Reembolsados" },
                { key: "EXPIRED", label: "Vencidos" },
                { key: "CANCELLED", label: "Cancelados" },
              ].map((st) => (
                <button
                  key={st.key}
                  onClick={() => setOrderStatusFilter(st.key)}
                  className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                    orderStatusFilter === st.key
                      ? "bg-[#141517] text-white"
                      : "bg-[#F7F7F5] text-[#52555A] hover:text-[#141517]"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded border border-[#DDDCDA] p-10 text-xs text-[#52555A]">
                No hay pedidos en este estado actualmente.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => (
                  <article
                    key={order.id}
                    className="bg-white rounded border border-[#DDDCDA] overflow-hidden"
                  >
                    <div className="px-6 py-3.5 bg-[#EBEAE4]/60 border-b border-[#DDDCDA] flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-semibold text-sm text-[#141517]">
                          {order.orderNumber}
                        </span>
                        <OrderStatusBadge status={order.status} />
                        <span className="text-xs text-[#52555A]">
                          Cliente:{" "}
                          <strong className="text-[#141517]">
                            {order.customerName}
                          </strong>{" "}
                          ({order.customerEmail})
                        </span>
                      </div>
                      <div className="text-xs font-mono font-bold text-[#141517]">
                        Total: {formatCurrency(order.totalCents)}
                      </div>
                    </div>

                    <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      <div className="lg:col-span-7 space-y-3">
                        <div className="divide-y divide-[#DDDCDA] border border-[#DDDCDA] rounded bg-[#F7F7F5] px-4">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="py-2 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-medium text-[#141517]">
                                  {item.nameSnapshot}
                                </span>
                                <span className="ml-2 font-mono text-[#52555A]">
                                  {item.skuSnapshot}
                                </span>
                              </div>
                              <span className="font-mono font-semibold text-[#141517]">
                                {item.quantity} unidades
                              </span>
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="p-3 rounded bg-amber-50 border border-amber-300 text-amber-950 text-xs">
                            {order.notes}
                          </div>
                        )}

                        {/* Operational actions */}
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                          {order.status === "PAID" && (
                            <>
                              <button
                                disabled={!canModifyPhysicalStock}
                                onClick={() =>
                                  handleTransitionOrder(
                                    order.id,
                                    "PROCESSING",
                                    "Preparación y empaque iniciados en almacén"
                                  )
                                }
                                className="px-3.5 py-1.5 rounded bg-[#141517] hover:bg-[#2A2C30] disabled:bg-[#EBEAE4] disabled:text-[#52555A] text-white text-xs font-medium cursor-pointer disabled:cursor-not-allowed"
                              >
                                Iniciar preparación en almacén
                              </button>

                              <button
                                onClick={() =>
                                  handleTransitionOrder(
                                    order.id,
                                    "REFUND_PENDING",
                                    "Cancelación antes de preparación; unidades liberadas a disponibles"
                                  )
                                }
                                className="px-3 py-1.5 rounded bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 text-xs font-medium cursor-pointer"
                              >
                                Cancelar y pasar a reembolso
                              </button>
                            </>
                          )}

                          {order.status === "PROCESSING" && (
                            <>
                              <button
                                disabled={!canModifyPhysicalStock}
                                onClick={() =>
                                  handleTransitionOrder(
                                    order.id,
                                    "SHIPPED",
                                    "Pedido despachado de almacén; salida física descontada del inventario"
                                  )
                                }
                                className="px-3.5 py-1.5 rounded bg-[#1D4ED8] hover:bg-blue-800 disabled:bg-[#EBEAE4] disabled:text-[#52555A] text-white text-xs font-medium cursor-pointer disabled:cursor-not-allowed"
                              >
                                Despachar paquete y descontar stock físico
                              </button>

                              {canProcessRefunds && (
                                <button
                                  onClick={() =>
                                    handleTransitionOrder(
                                      order.id,
                                      "REFUND_PENDING",
                                      "Preparación detenida por atención al cliente; unidades devueltas a disponibles"
                                    )
                                  }
                                  className="px-3 py-1.5 rounded bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 text-xs font-medium cursor-pointer"
                                >
                                  Detener preparación y reembolsar
                                </button>
                              )}
                            </>
                          )}

                          {order.status === "SHIPPED" && (
                            <button
                              onClick={() =>
                                handleTransitionOrder(
                                  order.id,
                                  "DELIVERED",
                                  "Entrega confirmada por paquetería"
                                )
                              }
                              className="px-3.5 py-1.5 rounded bg-[#141517] hover:bg-[#2A2C30] text-white text-xs font-medium cursor-pointer"
                            >
                              Registrar entrega completada
                            </button>
                          )}

                          {order.status === "RETURN_REQUESTED" && (
                            <button
                              disabled={!canModifyPhysicalStock}
                              onClick={() => openInspectionModal(order)}
                              className="px-3.5 py-1.5 rounded bg-[#141517] hover:bg-[#2A2C30] disabled:bg-[#EBEAE4] disabled:text-[#52555A] text-white text-xs font-medium cursor-pointer disabled:cursor-not-allowed"
                            >
                              Inspeccionar devolución en almacén
                            </button>
                          )}

                          {order.status === "RETURNED" && (
                            <button
                              onClick={() =>
                                handleTransitionOrder(
                                  order.id,
                                  "REFUND_PENDING",
                                  "Inspección física concluida; se autoriza el reembolso al cliente"
                                )
                              }
                              className="px-3.5 py-1.5 rounded bg-[#141517] hover:bg-[#2A2C30] text-white text-xs font-medium cursor-pointer"
                            >
                              Autorizar reembolso
                            </button>
                          )}

                          {order.status === "REFUND_PENDING" && (
                            <button
                              disabled={!canProcessRefunds}
                              onClick={() =>
                                handleTransitionOrder(
                                  order.id,
                                  "REFUNDED",
                                  "Reembolso ejecutado por atención al cliente"
                                )
                              }
                              className="px-3.5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 disabled:bg-[#EBEAE4] disabled:text-[#52555A] text-white text-xs font-medium cursor-pointer disabled:cursor-not-allowed"
                            >
                              Confirmar reembolso al cliente
                            </button>
                          )}
                        </div>
                      </div>

                      {/* History */}
                      <div className="lg:col-span-5 bg-[#F7F7F5] rounded p-3.5 border border-[#DDDCDA] max-h-48 overflow-y-auto">
                        <span className="text-xs font-semibold text-[#141517] block mb-2">
                          Historial de cambios ({order.stateHistory.length})
                        </span>
                        <div className="space-y-2">
                          {order.stateHistory.map((h) => (
                            <div
                              key={h.id}
                              className="text-xs border-l-2 border-[#141517] pl-2.5 py-0.5"
                            >
                              <div className="font-medium text-[#141517]">
                                {h.fromStatus
                                  ? `${h.fromStatus} a ${h.toStatus}`
                                  : h.toStatus}{" "}
                                <span className="text-[#52555A] font-normal">
                                  ({h.actorRole})
                                </span>
                              </div>
                              <p className="text-[#52555A]">{h.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: INVENTORY */}
        {activeTab === "inventory" && (
          <div className="bg-white rounded border border-[#DDDCDA] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDDCDA] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#141517]">
                  Saldos de inventario por modelo
                </h2>
                <p className="text-xs text-[#52555A]">
                  En cada fila se cumple que las unidades en almacén equivalen a
                  la suma de disponibles más apartadas en reserva.
                </p>
              </div>
              {!canModifyPhysicalStock && (
                <span className="px-3 py-1 rounded bg-amber-50 border border-amber-300 text-amber-950 text-xs">
                  Vista de consulta para tu rol actual
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#EBEAE4]/60 border-b border-[#DDDCDA] font-semibold text-[#141517]">
                    <th className="py-3 px-4">Modelo y código</th>
                    <th className="py-3 px-4">Ubicación</th>
                    <th className="py-3 px-4 text-right">En almacén</th>
                    <th className="py-3 px-4 text-right">Disponibles</th>
                    <th className="py-3 px-4 text-right">En reserva</th>
                    <th className="py-3 px-4 text-right">En cuarentena</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDDCDA]">
                  {inventoryItems.map((item) => (
                    <tr
                      key={item.inventoryItemId}
                      className="hover:bg-[#F7F7F5]"
                    >
                      <td className="py-3 px-4">
                        <span className="font-semibold text-[#141517] block">
                          {item.productName} — {item.variantName}
                        </span>
                        <span className="font-mono text-[#52555A]">
                          {item.sku}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#52555A]">
                        {item.warehouseCode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-[#141517]">
                        {item.onHand}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-emerald-800">
                        {item.available}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-amber-800">
                        {item.reserved}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-rose-800">
                        {item.damaged}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          disabled={!canModifyPhysicalStock}
                          onClick={() => {
                            setAdjustModalItem(item);
                            setAdjustOp("RESTOCK");
                            setAdjustQty(5);
                            setAdjustReason(
                              `Recepción de mercancía en almacén para ${item.sku}`
                            );
                          }}
                          className="px-3 py-1.5 rounded bg-[#141517] hover:bg-[#2A2C30] disabled:bg-[#EBEAE4] disabled:text-[#52555A] text-white font-medium text-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          Registrar entrada o ajuste
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: LEDGER */}
        {activeTab === "ledger" && (
          <div className="bg-white rounded border border-[#DDDCDA] overflow-hidden">
            <div className="p-5 border-b border-[#DDDCDA] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#141517]">
                  Registro contable de movimientos
                </h2>
                <p className="text-xs text-[#52555A]">
                  Bitácora inmutable de cada entrada, reserva, envío, devolución
                  o ajuste con los saldos posteriores a la operación.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ledgerSkuFilter}
                  onChange={(e) => setLedgerSkuFilter(e.target.value)}
                  className="text-xs border border-[#DDDCDA] rounded px-3 py-1.5 bg-white text-[#141517]"
                >
                  <option value="">Todos los modelos</option>
                  {inventoryItems.map((i) => (
                    <option key={i.variantId} value={i.variantId}>
                      {i.sku} — {i.productName}
                    </option>
                  ))}
                </select>

                <select
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value)}
                  className="text-xs border border-[#DDDCDA] rounded px-3 py-1.5 bg-white text-[#141517]"
                >
                  <option value="">Todos los tipos de movimiento</option>
                  {(
                    [
                      "RESTOCK",
                      "RESERVE",
                      "RELEASE_EXPIRED",
                      "RELEASE_CANCELLED",
                      "COMMIT_SALE",
                      "RETURN_TO_AVAILABLE",
                      "RETURN_TO_DAMAGED",
                      "MANUAL_ADJUSTMENT",
                    ] as MovementType[]
                  ).map((mt) => (
                    <option key={mt} value={mt}>
                      {mt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#EBEAE4]/60 border-b border-[#DDDCDA] font-semibold text-[#141517]">
                    <th className="py-3 px-4">Fecha y hora</th>
                    <th className="py-3 px-4">Modelo</th>
                    <th className="py-3 px-4">Operación</th>
                    <th className="py-3 px-4 text-right">Variación</th>
                    <th className="py-3 px-4 text-right">
                      Saldos resultantes (Almacén / Disp. / Reserva / Cuarentena)
                    </th>
                    <th className="py-3 px-4">Referencia</th>
                    <th className="py-3 px-4">Responsable y motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDDCDA]">
                  {filteredLedger.map((row) => (
                    <tr key={row.id} className="hover:bg-[#F7F7F5]">
                      <td className="py-3 px-4 font-mono text-[11px] text-[#52555A] whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-[#141517] block">
                          {row.sku}
                        </span>
                        <span className="text-[11px] text-[#52555A]">
                          {row.variantName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <MovementBadge type={row.movementType} />
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                          row.quantityDelta > 0
                            ? "text-emerald-800"
                            : "text-rose-800"
                        }`}
                      >
                        {row.quantityDelta > 0
                          ? `+${row.quantityDelta}`
                          : row.quantityDelta}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#52555A]">
                        <strong className="text-[#141517]">
                          {row.onHandAfter}
                        </strong>{" "}
                        / {row.availableAfter} / {row.reservedAfter} /{" "}
                        {row.damagedAfter}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#52555A]">
                        {row.referenceId}
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <span className="font-medium text-[#141517] block">
                          {row.actorName
                            ? `${row.actorName} (${row.actorRole})`
                            : "Proceso automático del sistema"}
                        </span>
                        <span className="text-[#52555A]">{row.reason}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: MANUAL STOCK ADJUSTMENT */}
      {adjustModalItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-[#DDDCDA] max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between border-b border-[#DDDCDA] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#141517]">
                  Registrar entrada o ajuste en {adjustModalItem.sku}
                </h3>
                <p className="text-xs text-[#52555A]">
                  {adjustModalItem.productName} ({adjustModalItem.variantName})
                </p>
              </div>
              <button
                onClick={() => setAdjustModalItem(null)}
                className="text-xs text-[#52555A] hover:text-[#141517] cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center bg-[#F7F7F5] p-3 rounded border border-[#DDDCDA] text-xs">
              <div>
                <span className="text-[#52555A] block">En almacén</span>
                <span className="font-mono font-bold text-[#141517]">
                  {adjustModalItem.onHand}
                </span>
              </div>
              <div>
                <span className="text-[#52555A] block">Disponibles</span>
                <span className="font-mono font-bold text-emerald-800">
                  {adjustModalItem.available}
                </span>
              </div>
              <div>
                <span className="text-[#52555A] block">En reserva</span>
                <span className="font-mono font-bold text-amber-800">
                  {adjustModalItem.reserved}
                </span>
              </div>
              <div>
                <span className="text-[#52555A] block">En cuarentena</span>
                <span className="font-mono font-bold text-rose-800">
                  {adjustModalItem.damaged}
                </span>
              </div>
            </div>

            <form onSubmit={submitManualAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#141517] mb-1">
                  Tipo de operación
                </label>
                <select
                  value={adjustOp}
                  onChange={(e) =>
                    setAdjustOp(e.target.value as StockAdjustmentOperation)
                  }
                  className="w-full text-xs border border-[#DDDCDA] rounded px-3 py-2 bg-white text-[#141517]"
                >
                  <option value="RESTOCK">
                    Entrada de mercancía (suma a almacén y disponibles)
                  </option>
                  <option value="MARK_DAMAGED">
                    Separar unidades dañadas a cuarentena
                  </option>
                  <option value="DISPOSE_DAMAGED">
                    Dar de baja definitiva unidades en cuarentena
                  </option>
                  <option value="MANUAL_COUNT_CORRECTION">
                    Corrección por conteo físico (+/-)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#141517] mb-1">
                  Cantidad de unidades
                </label>
                <input
                  type="number"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                  className="w-full text-sm font-mono border border-[#DDDCDA] rounded px-3 py-2 bg-white text-[#141517]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#141517] mb-1">
                  Motivo para el registro contable
                </label>
                <textarea
                  required
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full text-xs border border-[#DDDCDA] rounded px-3 py-2 bg-white text-[#141517]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalItem(null)}
                  className="px-4 py-2 rounded border border-[#DDDCDA] text-xs font-medium text-[#52555A] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adjustSubmitting}
                  className="px-4 py-2 rounded bg-[#141517] hover:bg-[#2A2C30] text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                >
                  {adjustSubmitting
                    ? "Guardando..."
                    : "Guardar movimiento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: WAREHOUSE RETURN INSPECTION */}
      {inspectModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-[#DDDCDA] max-w-xl w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between border-b border-[#DDDCDA] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#141517]">
                  Inspección de devolución del pedido{" "}
                  {inspectModalOrder.orderNumber}
                </h3>
                <p className="text-xs text-[#52555A]">
                  Indica cuántas unidades regresan en buen estado a la venta y
                  cuántas pasan a cuarentena por daño.
                </p>
              </div>
              <button
                onClick={() => setInspectModalOrder(null)}
                className="text-xs text-[#52555A] hover:text-[#141517] cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={submitReturnInspection} className="space-y-4">
              <div className="space-y-3">
                {inspectModalOrder.items.map((item) => {
                  const split = inspectionSplits[item.id] ?? {
                    toAvailableQty: item.quantity,
                    toDamagedQty: 0,
                  };
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded bg-[#F7F7F5] border border-[#DDDCDA] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#141517]">
                          {item.nameSnapshot} ({item.skuSnapshot})
                        </span>
                        <span className="font-mono font-medium text-[#52555A]">
                          Total devuelto: {item.quantity}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-xs font-medium text-emerald-900 mb-1">
                            Unidades aptas para venta
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={item.quantity}
                            value={split.toAvailableQty}
                            onChange={(e) => {
                              const good = Math.max(
                                0,
                                Math.min(item.quantity, Number(e.target.value))
                              );
                              setInspectionSplits((prev) => ({
                                ...prev,
                                [item.id]: {
                                  toAvailableQty: good,
                                  toDamagedQty: item.quantity - good,
                                },
                              }));
                            }}
                            className="w-full text-xs font-mono border border-[#DDDCDA] rounded px-3 py-1.5 bg-white text-[#141517]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-rose-900 mb-1">
                            Unidades dañadas a cuarentena
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={item.quantity}
                            value={split.toDamagedQty}
                            onChange={(e) => {
                              const dmg = Math.max(
                                0,
                                Math.min(item.quantity, Number(e.target.value))
                              );
                              setInspectionSplits((prev) => ({
                                ...prev,
                                [item.id]: {
                                  toAvailableQty: item.quantity - dmg,
                                  toDamagedQty: dmg,
                                },
                              }));
                            }}
                            className="w-full text-xs font-mono border border-[#DDDCDA] rounded px-3 py-1.5 bg-white text-[#141517]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#141517] mb-1">
                  Resultado de la inspección
                </label>
                <textarea
                  required
                  rows={2}
                  value={inspectReason}
                  onChange={(e) => setInspectReason(e.target.value)}
                  className="w-full text-xs border border-[#DDDCDA] rounded px-3 py-2 bg-white text-[#141517]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInspectModalOrder(null)}
                  className="px-4 py-2 rounded border border-[#DDDCDA] text-xs font-medium text-[#52555A] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inspectSubmitting}
                  className="px-4 py-2 rounded bg-[#141517] hover:bg-[#2A2C30] text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                >
                  Guardar inspección de devolución
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
