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
      <div className="min-h-screen flex flex-col">
        <Navbar user={user} onUserChange={setUser} />
        <main className="flex-1 max-w-xl w-full mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="font-display text-xl font-extrabold text-white">
            ACCESO RESTRINGIDO AL PERSONAL OPERATIVO (RBAC)
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Actualmente estás autenticado como{" "}
            <strong className="text-white">
              {user ? user.role : "Invitado"}
            </strong>
            . Para acceder al Backoffice Terminal, inicia sesión como{" "}
            <strong className="text-amber-300">Operador de Almacén</strong>,{" "}
            <strong className="text-rose-300">Soporte</strong> o{" "}
            <strong className="text-emerald-300">Administrador</strong>.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#090B10] text-xs font-mono font-bold"
          >
            IR A CONTROL DE ACCESO / ROLES
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} onUserChange={setUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Backoffice Header */}
        <div className="bg-[#11151F] rounded-2xl border border-white/10 p-6 shadow-2xl flex flex-wrap items-center justify-between gap-4 animate-fade-up">
          <div>
            <div className="flex items-center gap-3">
              <LayoutDashboard className="w-6 h-6 text-emerald-400" />
              <h1 className="font-display text-xl font-extrabold text-white tracking-tight">
                BACKOFFICE TERMINAL // KARDEX &amp; ORDER STATE MACHINE
              </h1>
              {user && <RoleBadge role={user.role} />}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {user?.role === "WAREHOUSE_OPERATOR" &&
                "Modo Operador de Almacén: Tienes permisos para Picking/Envío, Inspección de Devoluciones y Ajustes Físicos de Stock."}
              {user?.role === "SUPPORT" &&
                "Modo Soporte (CS): Tienes permisos para Reembolsos y Cancelaciones Asistidas. Los ajustes físicos de stock están bloqueados por separación de funciones."}
              {user?.role === "ADMIN" &&
                "Modo Administrador: Control total sobre Almacén, Soporte, Kardex y herramientas de mantenimiento."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono">
            <button
              onClick={handleRunExpiryWorker}
              className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="Ejecuta SELECT ... FOR UPDATE SKIP LOCKED para liberar reservas cuyo TTL haya vencido"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              BARRER RESERVAS VENCIDAS (SKIP LOCKED)
            </button>

            {user?.role === "ADMIN" && (
              <button
                onClick={handleResetDemo}
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <DatabaseBackup className="w-3.5 h-3.5" />
                RESTAURAR SEED
              </button>
            )}

            <button
              onClick={loadBackofficeData}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              SYNC
            </button>
          </div>
        </div>

        {/* Accounting Invariant & KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-[#11151F] rounded-xl border border-white/10 p-4">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400">
              STOCK FÍSICO (ON_HAND)
            </span>
            <div className="text-2xl font-extrabold font-mono text-white mt-1">
              {totalOnHand}
            </div>
            <span className="text-[11px] text-slate-500">
              Unidades aptas en bodega
            </span>
          </div>

          <div className="bg-[#11151F] rounded-xl border border-white/10 p-4">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400">
              DISPONIBLE (AVAILABLE)
            </span>
            <div className="text-2xl font-extrabold font-mono text-emerald-400 mt-1">
              {totalAvailable}
            </div>
            <span className="text-[11px] text-slate-500">
              Libre para nuevos checkouts
            </span>
          </div>

          <div className="bg-[#11151F] rounded-xl border border-white/10 p-4">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400">
              RESERVADO (RESERVED)
            </span>
            <div className="text-2xl font-extrabold font-mono text-amber-400 mt-1">
              {totalReserved}
            </div>
            <span className="text-[11px] text-slate-500">
              Retenido por órdenes activas
            </span>
          </div>

          <div className="bg-[#11151F] rounded-xl border border-white/10 p-4">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-400">
              CUARENTENA (DAMAGED)
            </span>
            <div className="text-2xl font-extrabold font-mono text-rose-400 mt-1">
              {totalDamaged}
            </div>
            <span className="text-[11px] text-slate-500">
              Devoluciones dañadas / merma
            </span>
          </div>

          <div
            className={`rounded-xl border p-4 col-span-2 lg:col-span-1 ${
              isBalanceEquationValid
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
                : "bg-rose-500/15 border-rose-500/50 text-rose-200"
            }`}
          >
            <span className="text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              CUADRE CONTABLE ACID
            </span>
            <div className="text-base font-mono font-extrabold text-white mt-1.5">
              {totalOnHand} = {totalAvailable} + {totalReserved}
            </div>
            <span className="text-[10px] font-mono text-emerald-300/80 block mt-0.5">
              CHECK (on_hand = avail + res)
            </span>
          </div>
        </div>

        {statusMessage && (
          <div
            className={`p-4 rounded-xl border text-xs font-mono font-medium flex items-center justify-between ${
              statusMessage.type === "success"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                : statusMessage.type === "error"
                ? "bg-rose-500/15 border-rose-500/40 text-rose-200"
                : "bg-amber-500/15 border-amber-500/40 text-amber-200"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="font-bold ml-4 cursor-pointer"
            >
              [X]
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "orders"
                ? "bg-amber-500 text-[#090B10] shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                : "bg-[#11151F] text-slate-300 border border-white/10 hover:border-white/25"
            }`}
          >
            <Truck className="w-4 h-4" />
            1. MÁQUINA DE ESTADOS DE PEDIDOS ({orders.length})
          </button>

          <button
            onClick={() => setActiveTab("inventory")}
            className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "inventory"
                ? "bg-amber-500 text-[#090B10] shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                : "bg-[#11151F] text-slate-300 border border-white/10 hover:border-white/25"
            }`}
          >
            <Boxes className="w-4 h-4" />
            2. SALDOS CONSOLIDADOS Y AJUSTES ({inventoryItems.length} SKUs)
          </button>

          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "ledger"
                ? "bg-amber-500 text-[#090B10] shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                : "bg-[#11151F] text-slate-300 border border-white/10 hover:border-white/25"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            3. LIBRO MAYOR INMUTABLE / KARDEX ({ledger.length} MOVS)
          </button>
        </div>

        {/* TAB 1: ORDERS STATE MACHINE */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#11151F] p-4 rounded-xl border border-white/10">
              <div className="flex flex-wrap items-center gap-1.5 font-mono">
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
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                      orderStatusFilter === st
                        ? "bg-amber-500 text-[#090B10]"
                        : "bg-[#0B0E15] text-slate-400 border border-white/10 hover:text-white"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-[#11151F] rounded-2xl border border-white/10 p-12 text-center text-xs font-mono text-slate-400">
                NO HAY PEDIDOS QUE COINCIDAN CON EL FILTRO SELECCIONADO.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-[#11151F] rounded-2xl border border-white/10 shadow-xl overflow-hidden"
                  >
                    <div className="px-6 py-3.5 bg-[#0B0E15] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-sm text-amber-400">
                          {order.orderNumber}
                        </span>
                        <OrderStatusBadge status={order.status} />
                        <span className="text-xs text-slate-400">
                          Cliente:{" "}
                          <strong className="text-white">
                            {order.customerName}
                          </strong>{" "}
                          ({order.customerEmail})
                        </span>
                      </div>
                      <div className="text-xs font-mono font-bold text-white">
                        TOTAL: {formatCurrency(order.totalCents)}
                      </div>
                    </div>

                    <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      <div className="lg:col-span-7 space-y-3">
                        <div className="divide-y divide-white/10 border border-white/10 rounded-xl px-4 py-1 bg-[#0B0E15]">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="py-2 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-semibold text-white">
                                  {item.nameSnapshot}
                                </span>
                                <span className="ml-2 font-mono text-amber-400">
                                  [{item.skuSnapshot}]
                                </span>
                              </div>
                              <span className="font-mono font-bold text-slate-200">
                                {item.quantity} UDS
                              </span>
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs font-medium">
                            {order.notes}
                          </div>
                        )}

                        {/* Role-based Operational State Machine Buttons */}
                        <div className="pt-2 flex flex-wrap items-center gap-2 font-mono">
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
                                className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-white/5 disabled:text-slate-600 text-[#090B10] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <Boxes className="w-3.5 h-3.5" />
                                INICIAR PICKING (PAID → PROCESSING)
                              </button>

                              <button
                                onClick={() =>
                                  handleTransitionOrder(
                                    order.id,
                                    "REFUND_PENDING",
                                    "Cancelación pre-picking autorizada; stock liberado a available"
                                  )
                                }
                                className="px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-bold cursor-pointer"
                              >
                                CANCELAR Y ENVIAR A REEMBOLSO
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
                                className="px-3.5 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:bg-white/5 disabled:text-slate-600 text-[#090B10] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                DESPACHAR PEDIDO (COMMIT_SALE)
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
                                  className="px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-bold cursor-pointer"
                                >
                                  ABORTAR PICKING Y REEMBOLSAR (SOPORTE)
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
                              className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#090B10] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              MARCAR COMO ENTREGADO (DELIVERED)
                            </button>
                          )}

                          {/* RETURN_REQUESTED -> RETURNED (Warehouse Inspection Modal) */}
                          {order.status === "RETURN_REQUESTED" && (
                            <button
                              disabled={!canModifyPhysicalStock}
                              onClick={() => openInspectionModal(order)}
                              className="px-3.5 py-2 rounded-lg bg-teal-400 hover:bg-teal-300 disabled:bg-white/5 disabled:text-slate-600 text-[#090B10] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              INSPECCIONAR DEVOLUCIÓN RMA (AVAILABLE vs DAMAGED)
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
                              className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090B10] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              PASAR A COLA DE REEMBOLSO (REFUND_PENDING)
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
                              className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/5 disabled:text-slate-600 text-[#090B10] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              EJECUTAR REEMBOLSO (SOPORTE/ADMIN)
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Order History Compact */}
                      <div className="lg:col-span-5 bg-[#0B0E15] rounded-xl p-3.5 border border-white/10 max-h-48 overflow-y-auto">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block mb-2">
                          BITÁCORA DE AUDITORÍA ({order.stateHistory.length})
                        </span>
                        <div className="space-y-2">
                          {order.stateHistory.map((h) => (
                            <div
                              key={h.id}
                              className="text-xs border-l-2 border-amber-500 pl-2.5 py-0.5"
                            >
                              <div className="font-mono font-bold text-[11px] text-amber-300">
                                {h.fromStatus ? `${h.fromStatus} → ` : ""}
                                {h.toStatus}{" "}
                                <span className="text-slate-500 font-normal">
                                  ({h.actorRole})
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-300">
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
          <div className="bg-[#11151F] rounded-2xl border border-white/10 shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-white">
                  SALDOS CONSOLIDADOS POR VARIANTE (SKU)
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  CONSTRAINT:{" "}
                  <code className="text-emerald-300">
                    CHECK (on_hand = available + reserved AND all &gt;= 0)
                  </code>
                </p>
              </div>
              {!canModifyPhysicalStock && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-mono">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  SOLO LECTURA PARA ROL {user?.role}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B0E15] border-b border-white/10 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4">SKU / VARIANTE</th>
                    <th className="py-3.5 px-4">BODEGA</th>
                    <th className="py-3.5 px-4 text-right">ON_HAND</th>
                    <th className="py-3.5 px-4 text-right">AVAILABLE</th>
                    <th className="py-3.5 px-4 text-right">RESERVED</th>
                    <th className="py-3.5 px-4 text-right">DAMAGED</th>
                    <th className="py-3.5 px-4 text-center">VER</th>
                    <th className="py-3.5 px-4 text-right">OPERACIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {inventoryItems.map((item) => (
                    <tr
                      key={item.inventoryItemId}
                      className="hover:bg-white/[0.02]"
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-amber-400 block">
                          {item.sku}
                        </span>
                        <span className="font-semibold text-white block">
                          {item.productName}
                        </span>
                        <span className="text-slate-400">
                          {item.variantName}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {item.warehouseCode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-white">
                        {item.onHand}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-emerald-400">
                        {item.available}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-amber-400">
                        {item.reserved}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-rose-400">
                        {item.damaged}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">
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
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-white/5 disabled:text-slate-600 text-[#090B10] font-mono font-bold text-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          AJUSTAR STOCK
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
          <div className="bg-[#11151F] rounded-2xl border border-white/10 shadow-xl overflow-hidden space-y-4">
            <div className="p-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold text-white">
                  LIBRO MAYOR INMUTABLE DE INVENTARIO (KARDEX)
                </h2>
                <p className="text-xs text-slate-400">
                  Registro histórico append-only de cada transacción ACID con
                  delta y saldos resultantes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono">
                <select
                  value={ledgerSkuFilter}
                  onChange={(e) => setLedgerSkuFilter(e.target.value)}
                  className="text-xs border border-white/15 rounded-lg px-3 py-2 bg-[#090B10] text-white"
                >
                  <option value="">TODOS LOS SKUs</option>
                  {inventoryItems.map((i) => (
                    <option key={i.variantId} value={i.variantId}>
                      {i.sku} — {i.productName}
                    </option>
                  ))}
                </select>

                <select
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value)}
                  className="text-xs border border-white/15 rounded-lg px-3 py-2 bg-[#090B10] text-white"
                >
                  <option value="">TODOS LOS MOVIMIENTOS</option>
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
                  <tr className="bg-[#0B0E15] border-b border-white/10 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4">TIMESTAMP</th>
                    <th className="py-3.5 px-4">SKU</th>
                    <th className="py-3.5 px-4">MOVIMIENTO</th>
                    <th className="py-3.5 px-4 text-right">DELTA</th>
                    <th className="py-3.5 px-4 text-right">
                      SALDOS POST-TX (OH / AV / RS / DM)
                    </th>
                    <th className="py-3.5 px-4">REFERENCIA</th>
                    <th className="py-3.5 px-4">ACTOR &amp; MOTIVO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredLedger.map((row) => (
                    <tr key={row.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-amber-400 block">
                          {row.sku}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {row.variantName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <MovementBadge type={row.movementType} />
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold text-sm ${
                          row.quantityDelta > 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {row.quantityDelta > 0
                          ? `+${row.quantityDelta}`
                          : row.quantityDelta}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        <span className="font-bold text-white">
                          OH:{row.onHandAfter}
                        </span>{" "}
                        |{" "}
                        <span className="text-emerald-400 font-bold">
                          AV:{row.availableAfter}
                        </span>{" "}
                        |{" "}
                        <span className="text-amber-400 font-bold">
                          RS:{row.reservedAfter}
                        </span>{" "}
                        |{" "}
                        <span className="text-rose-400">
                          DM:{row.damagedAfter}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                        <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                          {row.referenceType}: {row.referenceId}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-md">
                        <span className="font-semibold text-white block">
                          {row.actorName
                            ? `${row.actorName} (${row.actorRole})`
                            : "SYSTEM_DAEMON (Worker/Webhook)"}
                        </span>
                        <span className="text-slate-400">{row.reason}</span>
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#11151F] rounded-2xl border border-amber-500/40 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-white">
                  MOVIMIENTO AUDITADO DE ALMACÉN // {adjustModalItem.sku}
                </h3>
                <p className="text-xs text-slate-400">
                  {adjustModalItem.productName} ({adjustModalItem.variantName})
                </p>
              </div>
              <button
                onClick={() => setAdjustModalItem(null)}
                className="text-slate-400 hover:text-white font-mono font-bold cursor-pointer"
              >
                [X]
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center bg-[#090B10] p-3 rounded-xl border border-white/10 text-xs font-mono">
              <div>
                <span className="text-slate-500 block">ON_HAND</span>
                <span className="font-bold text-white">
                  {adjustModalItem.onHand}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">AVAILABLE</span>
                <span className="font-bold text-emerald-400">
                  {adjustModalItem.available}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">RESERVED</span>
                <span className="font-bold text-amber-400">
                  {adjustModalItem.reserved}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">DAMAGED</span>
                <span className="font-bold text-rose-400">
                  {adjustModalItem.damaged}
                </span>
              </div>
            </div>

            <form onSubmit={submitManualAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
                  TIPO DE OPERACIÓN EN ALMACÉN
                </label>
                <select
                  value={adjustOp}
                  onChange={(e) =>
                    setAdjustOp(e.target.value as StockAdjustmentOperation)
                  }
                  className="w-full text-xs font-mono border border-white/15 rounded-lg px-3 py-2.5 bg-[#090B10] text-white"
                >
                  <option value="RESTOCK">
                    RESTOCK — Entrada de mercancía (+on_hand, +available)
                  </option>
                  <option value="MARK_DAMAGED">
                    MARK_DAMAGED — Mover a Cuarentena/Dañado (-on_hand,
                    -available, +damaged)
                  </option>
                  <option value="DISPOSE_DAMAGED">
                    DISPOSE_DAMAGED — Baja definitiva de Cuarentena (-damaged)
                  </option>
                  <option value="MANUAL_COUNT_CORRECTION">
                    MANUAL_COUNT_CORRECTION — Ajuste por conteo cíclico (+/-)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
                  CANTIDAD DE UNIDADES
                </label>
                <input
                  type="number"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                  className="w-full text-sm font-mono border border-white/15 rounded-lg px-3 py-2 bg-[#090B10] text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
                  MOTIVO DE AUDITORÍA (OBLIGATORIO PARA EL KARDEX)
                </label>
                <textarea
                  required
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full text-xs border border-white/15 rounded-lg px-3 py-2 bg-[#090B10] text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 font-mono">
                <button
                  type="button"
                  onClick={() => setAdjustModalItem(null)}
                  className="px-4 py-2 rounded-lg border border-white/15 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={adjustSubmitting}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090B10] text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {adjustSubmitting
                    ? "EJECUTANDO TX ACID..."
                    : "APLICAR Y REGISTRAR EN KARDEX"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: WAREHOUSE RETURN INSPECTION (AVAILABLE VS DAMAGED) */}
      {inspectModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#11151F] rounded-2xl border border-teal-500/40 max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-white">
                  INSPECCIÓN FÍSICA RMA // {inspectModalOrder.orderNumber}
                </h3>
                <p className="text-xs text-slate-400">
                  Decide por cada SKU devuelto cuántas unidades se reintegran a{" "}
                  <code className="font-mono text-emerald-400">available</code>{" "}
                  y cuántas van a{" "}
                  <code className="font-mono text-rose-400">damaged</code>.
                </p>
              </div>
              <button
                onClick={() => setInspectModalOrder(null)}
                className="text-slate-400 hover:text-white font-mono font-bold cursor-pointer"
              >
                [X]
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
                      className="p-3.5 rounded-xl bg-[#090B10] border border-white/10 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">
                          {item.nameSnapshot} ({item.skuSnapshot})
                        </span>
                        <span className="font-mono font-bold text-amber-400">
                          DEVUELTO: {item.quantity} UDS
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-emerald-400 mb-1">
                            REINTEGRAR A VENDIBLE (+AVAILABLE)
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
                            className="w-full text-xs font-mono border border-emerald-500/40 rounded-lg px-3 py-1.5 bg-[#11151F] text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono font-bold text-rose-400 mb-1">
                            ENVIAR A CUARENTENA (+DAMAGED)
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
                            className="w-full text-xs font-mono border border-rose-500/40 rounded-lg px-3 py-1.5 bg-[#11151F] text-white"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 mb-1">
                  DICTAMEN DE INSPECCIÓN (KARDEX &amp; HISTORIAL DE PEDIDO)
                </label>
                <textarea
                  required
                  rows={2}
                  value={inspectReason}
                  onChange={(e) => setInspectReason(e.target.value)}
                  className="w-full text-xs border border-white/15 rounded-lg px-3 py-2 bg-[#090B10] text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 font-mono">
                <button
                  type="button"
                  onClick={() => setInspectModalOrder(null)}
                  className="px-4 py-2 rounded-lg border border-white/15 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={inspectSubmitting}
                  className="px-4 py-2 rounded-lg bg-teal-400 hover:bg-teal-300 text-[#090B10] text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  CONFIRMAR RECEPCIÓN E IMPACTAR KARDEX
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
