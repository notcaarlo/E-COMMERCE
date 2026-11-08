"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Boxes,
  FileSpreadsheet,
  Truck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Wrench,
  RotateCcw,
  Clock,
  DollarSign,
  DatabaseBackup,
  Lock,
} from "lucide-react";
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

  // Warehouse Return Inspection Modal State (RETURN_REQUESTED -> RETURNED)
  const [inspectModalOrder, setInspectModalOrder] = useState<OrderDTO | null>(
    null
  );
  const [inspectionSplits, setInspectionSplits] = useState<
    Record<string, { toAvailableQty: number; toDamagedQty: number }>
  >({});
  const [inspectReason, setInspectReason] = useState<string>(
    "Inspección física de RMA completada en mesa de control de calidad"
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
          text: data.error || "Error al cambiar el estado del pedido.",
        });
        return false;
      }
      setStatusMessage({
        type: "success",
        text: `Pedido ${data.order.orderNumber} transicionado exitosamente a ${data.order.status}.`,
      });
      await loadBackofficeData();
      return true;
    } catch {
      setStatusMessage({
        type: "error",
        text: "Error de conexión con el servidor.",
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
          text: data.error || "No se pudo aplicar el ajuste de inventario.",
        });
        setAdjustSubmitting(false);
        return;
      }
      setStatusMessage({
        type: "success",
        text: `Ajuste [${adjustOp}] aplicado en SKU ${data.result.sku}. Nuevo saldo: OnHand=${data.result.onHand}, Available=${data.result.available}, Damaged=${data.result.damaged}.`,
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
      text: `Worker SKIP LOCKED ejecutado: ${
        data.expiredOrderIds?.length ?? 0
      } órdenes vencidas procesadas y ${
        data.releasedUnits ?? 0
      } unidades devueltas a 'available'.`,
    });
    await loadBackofficeData();
  };

  const handleResetDemo = async () => {
    if (
      !window.confirm(
        "¿Deseas restaurar la base de datos al estado inicial (Seed)?"
      )
    ) {
      return;
    }
    const res = await fetch("/api/demo/reset", { method: "POST" });
    const data = await res.json();
    setStatusMessage({
      type: "info",
      text: data.message || "Datos restaurados.",
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
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Navbar user={user} onUserChange={setUser} />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Acceso Restringido al Personal de Operaciones (RBAC)
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Actualmente estás autenticado como{" "}
            <strong>{user ? user.role : "Invitado"}</strong>. Para acceder al
            Dashboard Administrativo, inicia sesión con una cuenta de{" "}
            <strong>Operador de Almacén</strong>, <strong>Soporte</strong> o{" "}
            <strong>Administrador</strong>.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
          >
            Ir a Selector de Cuentas / Login
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar user={user} onUserChange={setUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Backoffice Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <LayoutDashboard className="w-6 h-6 text-indigo-600" />
              <h1 className="text-xl font-bold text-slate-900">
                Centro de Control de Inventarios, Kardex y Pedidos
              </h1>
              {user && <RoleBadge role={user.role} />}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {user?.role === "WAREHOUSE_OPERATOR" &&
                "Vista Operador de Almacén: Tienes permisos para Picking/Envío, Inspección de Devoluciones y Ajustes Físicos de Stock."}
              {user?.role === "SUPPORT" &&
                "Vista Soporte (CS): Tienes permisos para Reembolsos y Cancelaciones Asistidas. Los ajustes físicos de stock están bloqueados por separación de funciones."}
              {user?.role === "ADMIN" &&
                "Vista Administrador: Tienes control total sobre Almacén, Soporte, Kardex y herramientas de mantenimiento."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunExpiryWorker}
              className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              title="Ejecuta SELECT ... FOR UPDATE SKIP LOCKED para liberar reservas cuyo TTL haya vencido"
            >
              <Clock className="w-3.5 h-3.5 text-amber-700" />
              Barrer Reservas Vencidas (Worker)
            </button>

            {user?.role === "ADMIN" && (
              <button
                onClick={handleResetDemo}
                className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <DatabaseBackup className="w-3.5 h-3.5" />
                Restaurar Seed Inicial
              </button>
            )}

            <button
              onClick={loadBackofficeData}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refrescar
            </button>
          </div>
        </div>

        {/* Accounting Invariant & KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <span className="text-[11px] font-semibold uppercase text-slate-400">
              Stock Físico (on_hand)
            </span>
            <div className="text-2xl font-extrabold font-mono text-slate-900 mt-1">
              {totalOnHand}
            </div>
            <span className="text-[11px] text-slate-500">
              Unidades aptas en bodega
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <span className="text-[11px] font-semibold uppercase text-emerald-600">
              Disponible (available)
            </span>
            <div className="text-2xl font-extrabold font-mono text-emerald-600 mt-1">
              {totalAvailable}
            </div>
            <span className="text-[11px] text-slate-500">
              Libre para nuevos checkouts
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <span className="text-[11px] font-semibold uppercase text-amber-600">
              Reservado (reserved)
            </span>
            <div className="text-2xl font-extrabold font-mono text-amber-600 mt-1">
              {totalReserved}
            </div>
            <span className="text-[11px] text-slate-500">
              Retenido por órdenes activas
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <span className="text-[11px] font-semibold uppercase text-rose-600">
              Cuarentena (damaged)
            </span>
            <div className="text-2xl font-extrabold font-mono text-rose-600 mt-1">
              {totalDamaged}
            </div>
            <span className="text-[11px] text-slate-500">
              Devoluciones dañadas / merma
            </span>
          </div>

          <div
            className={`rounded-xl border p-4 col-span-2 lg:col-span-1 ${
              isBalanceEquationValid
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                : "bg-rose-50 border-rose-300 text-rose-950"
            }`}
          >
            <span className="text-[11px] font-bold uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Cuadre Contable ACID
            </span>
            <div className="text-sm font-mono font-bold mt-1.5">
              {totalOnHand} = {totalAvailable} + {totalReserved}
            </div>
            <span className="text-[11px] text-emerald-800 block mt-0.5">
              CHECK (on_hand = avail + res)
            </span>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between ${
              statusMessage.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : statusMessage.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-indigo-50 border-indigo-200 text-indigo-900"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="font-bold ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "orders"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Truck className="w-4 h-4" />
            1. Máquina de Estados de Pedidos ({orders.length})
          </button>

          <button
            onClick={() => setActiveTab("inventory")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "inventory"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <Boxes className="w-4 h-4" />
            2. Saldos de Inventario Consolidado y Ajustes ({inventoryItems.length}{" "}
            SKUs)
          </button>

          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "ledger"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            3. Libro Mayor Inmutable / Kardex ({ledger.length} movs)
          </button>
        </div>

        {/* TAB 1: ORDERS STATE MACHINE */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  "ALL",
                  "PENDING_PAYMENT",
                  "PAID",
                  "PROCESSING",
                  "SHIPPED",
                  "DELIVERED",
                  "RETURN_REQUESTED",
                  "RETURNED",
                  "REFUND_PENDING",
                  "REFUNDED",
                  "EXPIRED",
                  "CANCELLED",
                ].map((st) => (
                  <button
                    key={st}
                    onClick={() => setOrderStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                      orderStatusFilter === st
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
                No hay pedidos que coincidan con el filtro seleccionado.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
                  >
                    <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {order.orderNumber}
                        </span>
                        <OrderStatusBadge status={order.status} />
                        <span className="text-xs text-slate-500">
                          Cliente: <strong>{order.customerName}</strong> (
                          {order.customerEmail})
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-900">
                        Total: {formatCurrency(order.totalCents)}
                      </div>
                    </div>

                    <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      <div className="lg:col-span-7 space-y-3">
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4 py-1">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="py-2 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-semibold text-slate-800">
                                  {item.nameSnapshot}
                                </span>
                                <span className="ml-2 font-mono text-slate-500">
                                  ({item.skuSnapshot})
                                </span>
                              </div>
                              <span className="font-mono font-bold">
                                {item.quantity} uds
                              </span>
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-medium">
                            {order.notes}
                          </div>
                        )}

                        {/* Role-based Operational State Machine Buttons */}
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          {/* PAID -> PROCESSING (Warehouse / Admin) */}
                          {order.status === "PAID" && (
                            <>
                              <button
                                disabled={!canModifyPhysicalStock}
                                onClick={() =>
                                  handleTransitionOrder(
                                    order.id,
                                    "PROCESSING",
                                    "Operador de almacén inició Picking y Empaque"
                                  )
                                }
                                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <Boxes className="w-3.5 h-3.5" />
                                Iniciar Picking (PAID → PROCESSING)
                              </button>

                              <button
                                onClick={() =>
                                  handleTransitionOrder(
                                    order.id,
                                    "REFUND_PENDING",
                                    "Cancelación pre-picking autorizada; stock liberado a available"
                                  )
                                }
                                className="px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold cursor-pointer"
                              >
                                Cancelar y Enviar a Reembolso
                              </button>
                            </>
                          )}

                          {/* PROCESSING -> SHIPPED (Warehouse / Admin) */}
                          {order.status === "PROCESSING" && (
                            <>
                              <button
                                disabled={!canModifyPhysicalStock}
                                onClick={() =>
                                  handleTransitionOrder(
                                    order.id,
                                    "SHIPPED",
                                    "Paquete despachado físicamente; descuento definitivo de on_hand y reserved (COMMIT_SALE)"
                                  )
                                }
                                className="px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                Despachar Pedido (Descontar on_hand)
                              </button>

                              {canProcessRefunds && (
                                <button
                                  onClick={() =>
                                    handleTransitionOrder(
                                      order.id,
                                      "REFUND_PENDING",
                                      "Cancelación asistida por Soporte durante etapa de Picking; stock devuelto a available"
                                    )
                                  }
                                  className="px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold cursor-pointer"
                                >
                                  Abortar Picking y Reembolsar (Soporte)
                                </button>
                              )}
                            </>
                          )}

                          {/* SHIPPED -> DELIVERED */}
                          {order.status === "SHIPPED" && (
                            <button
                              onClick={() =>
                                handleTransitionOrder(
                                  order.id,
                                  "DELIVERED",
                                  "Confirmación de entrega por paquetería"
                                )
                              }
                              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Marcar como Entregado (DELIVERED)
                            </button>
                          )}

                          {/* RETURN_REQUESTED -> RETURNED (Warehouse Inspection Modal) */}
                          {order.status === "RETURN_REQUESTED" && (
                            <button
                              disabled={!canModifyPhysicalStock}
                              onClick={() => openInspectionModal(order)}
                              className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Recibir e Inspeccionar Devolución en Almacén
                              (Disponible vs Dañado)
                            </button>
                          )}

                          {/* RETURNED -> REFUND_PENDING */}
                          {order.status === "RETURNED" && (
                            <button
                              onClick={() =>
                                handleTransitionOrder(
                                  order.id,
                                  "REFUND_PENDING",
                                  "Inspección física concluida; se autoriza reembolso financiero al cliente"
                                )
                              }
                              className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              Pasar a Cola de Reembolso (REFUND_PENDING)
                            </button>
                          )}

                          {/* REFUND_PENDING -> REFUNDED (Support / Admin) */}
                          {order.status === "REFUND_PENDING" && (
                            <button
                              disabled={!canProcessRefunds}
                              onClick={() =>
                                handleTransitionOrder(
                                  order.id,
                                  "REFUNDED",
                                  "Reembolso ejecutado y conciliado por Soporte/Finanzas"
                                )
                              }
                              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              Ejecutar Reembolso al Cliente (Soporte/Admin)
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Order History Compact */}
                      <div className="lg:col-span-5 bg-slate-50 rounded-xl p-3.5 border border-slate-200 max-h-48 overflow-y-auto">
                        <span className="text-[11px] font-bold uppercase text-slate-400 block mb-2">
                          Bitácora de Auditoría ({order.stateHistory.length})
                        </span>
                        <div className="space-y-2">
                          {order.stateHistory.map((h) => (
                            <div
                              key={h.id}
                              className="text-xs border-l-2 border-indigo-500 pl-2.5 py-0.5"
                            >
                              <div className="font-mono font-bold text-[11px] text-slate-800">
                                {h.fromStatus ? `${h.fromStatus} → ` : ""}
                                {h.toStatus}{" "}
                                <span className="text-slate-400 font-normal">
                                  ({h.actorRole})
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600">
                                {h.reason}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CONSOLIDATED INVENTORY BALANCES & MANUAL ADJUSTMENTS */}
        {activeTab === "inventory" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Saldos Consolidados por Variante (SKU)
                </h2>
                <p className="text-xs text-slate-500">
                  Garantizado por PostgreSQL:{" "}
                  <code className="font-mono bg-slate-100 px-1 rounded">
                    CHECK (on_hand = available + reserved AND all &gt;= 0)
                  </code>
                </p>
              </div>
              {!canModifyPhysicalStock && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  Modo Lectura para Rol {user?.role}: Solo Almacén o Admin
                  pueden ajustar stock físico.
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3 px-4">SKU / Variante</th>
                    <th className="py-3 px-4">Almacén</th>
                    <th className="py-3 px-4 text-right">Físico (on_hand)</th>
                    <th className="py-3 px-4 text-right">Libre (available)</th>
                    <th className="py-3 px-4 text-right">
                      Retenido (reserved)
                    </th>
                    <th className="py-3 px-4 text-right">
                      Cuarentena (damaged)
                    </th>
                    <th className="py-3 px-4 text-center">Versión</th>
                    <th className="py-3 px-4 text-right">Acciones Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventoryItems.map((item) => (
                    <tr key={item.inventoryItemId} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-indigo-700 block">
                          {item.sku}
                        </span>
                        <span className="font-semibold text-slate-900 block">
                          {item.productName}
                        </span>
                        <span className="text-slate-500">
                          {item.variantName}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {item.warehouseCode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-slate-900">
                        {item.onHand}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-emerald-600">
                        {item.available}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-amber-600">
                        {item.reserved}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-rose-600">
                        {item.damaged}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-400">
                        v{item.version}
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          Ajustar / Recibir Stock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: IMMUTABLE INVENTORY LEDGER (KARDEX) */}
        {activeTab === "ledger" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
            <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Libro Mayor Inmutable de Inventario (Kardex)
                </h2>
                <p className="text-xs text-slate-500">
                  Registro histórico append-only de cada transacción ACID con
                  delta y saldos resultantes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ledgerSkuFilter}
                  onChange={(e) => setLedgerSkuFilter(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Todos los SKUs</option>
                  {inventoryItems.map((i) => (
                    <option key={i.variantId} value={i.variantId}>
                      {i.sku} — {i.productName}
                    </option>
                  ))}
                </select>

                <select
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Todos los Tipos de Movimiento</option>
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
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                    <th className="py-3 px-4">Fecha / Hora</th>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Movimiento</th>
                    <th className="py-3 px-4 text-right">Delta</th>
                    <th className="py-3 px-4 text-right">
                      Saldos Post-Movimiento (OnHand / Avail / Res / Dmg)
                    </th>
                    <th className="py-3 px-4">Referencia</th>
                    <th className="py-3 px-4">Actor &amp; Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLedger.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 block">
                          {row.sku}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {row.variantName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <MovementBadge type={row.movementType} />
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                          row.quantityDelta > 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {row.quantityDelta > 0
                          ? `+${row.quantityDelta}`
                          : row.quantityDelta}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        <span className="font-bold text-slate-900">
                          OH:{row.onHandAfter}
                        </span>{" "}
                        |{" "}
                        <span className="text-emerald-700 font-bold">
                          AV:{row.availableAfter}
                        </span>{" "}
                        |{" "}
                        <span className="text-amber-700 font-bold">
                          RS:{row.reservedAfter}
                        </span>{" "}
                        |{" "}
                        <span className="text-rose-700">
                          DM:{row.damagedAfter}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                          {row.referenceType}: {row.referenceId}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <span className="font-semibold text-slate-800 block">
                          {row.actorName
                            ? `${row.actorName} (${row.actorRole})`
                            : "Sistema Automático (Worker/Webhook)"}
                        </span>
                        <span className="text-slate-600">{row.reason}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: MANUAL STOCK ADJUSTMENT / RESTOCK */}
      {adjustModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Movimiento Auditado de Almacén — {adjustModalItem.sku}
                </h3>
                <p className="text-xs text-slate-500">
                  {adjustModalItem.productName} ({adjustModalItem.variantName})
                </p>
              </div>
              <button
                onClick={() => setAdjustModalItem(null)}
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block">On Hand</span>
                <span className="font-mono font-bold">
                  {adjustModalItem.onHand}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Available</span>
                <span className="font-mono font-bold text-emerald-600">
                  {adjustModalItem.available}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Reserved</span>
                <span className="font-mono font-bold text-amber-600">
                  {adjustModalItem.reserved}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Damaged</span>
                <span className="font-mono font-bold text-rose-600">
                  {adjustModalItem.damaged}
                </span>
              </div>
            </div>

            <form onSubmit={submitManualAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tipo de Operación en Almacén
                </label>
                <select
                  value={adjustOp}
                  onChange={(e) =>
                    setAdjustOp(e.target.value as StockAdjustmentOperation)
                  }
                  className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2.5"
                >
                  <option value="RESTOCK">
                    RESTOCK — Entrada de mercancía (+on_hand, +available)
                  </option>
                  <option value="MARK_DAMAGED">
                    MARK_DAMAGED — Pasar unidades libres a Cuarentena/Dañado
                    (-on_hand, -available, +damaged)
                  </option>
                  <option value="DISPOSE_DAMAGED">
                    DISPOSE_DAMAGED — Dar de baja definitiva stock en Cuarentena
                    (-damaged)
                  </option>
                  <option value="MANUAL_COUNT_CORRECTION">
                    MANUAL_COUNT_CORRECTION — Ajuste por conteo cíclico (+/-)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cantidad de Unidades
                </label>
                <input
                  type="number"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                  className="w-full text-sm font-mono border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motivo de Auditoría (Obligatorio para el Kardex)
                </label>
                <textarea
                  required
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="Ej. Recepción de orden de compra #OC-402 o Merma detectada en pasillo B..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalItem(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adjustSubmitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {adjustSubmitting
                    ? "Ejecutando Transacción ACID..."
                    : "Aplicar y Registrar en Kardex"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: WAREHOUSE RETURN INSPECTION (AVAILABLE VS DAMAGED) */}
      {inspectModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Inspección Física de Devolución —{" "}
                  {inspectModalOrder.orderNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Decide por cada SKU devuelto cuántas unidades se reintegran a{" "}
                  <code className="font-mono">available</code> y cuántas van a{" "}
                  <code className="font-mono">damaged</code>.
                </p>
              </div>
              <button
                onClick={() => setInspectModalOrder(null)}
                className="text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
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
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">
                          {item.nameSnapshot} ({item.skuSnapshot})
                        </span>
                        <span className="font-mono font-bold text-indigo-700">
                          Total devuelto: {item.quantity} uds
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-semibold text-emerald-800 mb-1">
                            Reintegrar a Vendible (+available / +on_hand)
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
                            className="w-full text-xs font-mono border border-emerald-300 rounded-lg px-3 py-1.5 bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-rose-800 mb-1">
                            Enviar a Cuarentena/Merma (+damaged)
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
                            className="w-full text-xs font-mono border border-rose-300 rounded-lg px-3 py-1.5 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Dictamen de Inspección (Kardex &amp; Historial de Pedido)
                </label>
                <textarea
                  required
                  rows={2}
                  value={inspectReason}
                  onChange={(e) => setInspectReason(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInspectModalOrder(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inspectSubmitting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  < XCircle className="w-3.5 h-3.5 hidden" />
                  Confirmar Recepción e Impactar Kardex
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
