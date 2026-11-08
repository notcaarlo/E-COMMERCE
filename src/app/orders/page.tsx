"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  PackageCheck,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Lock,
  History,
  CreditCard,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { formatCurrency, OrderStatusBadge } from "@/components/StatusBadge";
import type { OrderDTO, OrderStatus, SessionUser } from "@/lib/types/domain";

export default function CustomerOrdersPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      setUser(meData.user ?? null);

      if (meData.user) {
        const ordRes = await fetch("/api/orders?scope=mine");
        const ordData = await ordRes.json();
        setOrders(ordData.orders ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleCustomerTransition = async (
    orderId: string,
    targetStatus: OrderStatus,
    defaultReason: string
  ) => {
    setActionLoadingId(orderId);
    setBanner(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStatus,
          reason: defaultReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({
          type: "error",
          text: data.error || "No se pudo actualizar el pedido.",
        });
        return;
      }
      setBanner({
        type: "success",
        text: `Pedido ${data.order.orderNumber} actualizado a '${data.order.status}'.`,
      });
      await loadOrders();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePayFromOrders = async (
    orderId: string,
    eventType: "payment_intent.succeeded" | "payment_intent.payment_failed",
    forceExpireFirst = false
  ) => {
    setActionLoadingId(orderId);
    setBanner(null);
    try {
      const res = await fetch("/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          orderId,
          eventType,
          forceExpireFirst,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({
          type: "error",
          text: data.error || "Error al procesar pago.",
        });
        return;
      }
      setBanner({
        type:
          data.outcome === "PAID_ON_TIME" ||
          data.outcome === "LATE_PAYMENT_REACTIVATED"
            ? "success"
            : "info",
        text: `[${data.outcome}] ${data.message}`,
      });
      await loadOrders();
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar user={user} onUserChange={setUser} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <PackageCheck className="w-6 h-6 text-indigo-600" />
              Mis Pedidos y Trazabilidad de Estados
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Consulta el estado en tiempo real, cancela antes de que Almacén
              inicie el picking o solicita devoluciones.
            </p>
          </div>

          <button
            onClick={loadOrders}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualizar
          </button>
        </div>

        {banner && (
          <div
            className={`mb-6 p-4 rounded-xl border text-xs font-medium flex items-center justify-between ${
              banner.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : banner.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-indigo-50 border-indigo-200 text-indigo-900"
            }`}
          >
            <span>{banner.text}</span>
            <button
              onClick={() => setBanner(null)}
              className="font-bold ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {!user ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-800">
              Inicia sesión para ver tus pedidos
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
            >
              Ir a Iniciar Sesión
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-48 rounded-2xl bg-white border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <PackageCheck className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              Aún no tienes pedidos registrados
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Ve al catálogo de la tienda, agrega productos al carrito e inicia
              el Checkout para crear una reserva con TTL en PostgreSQL.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors"
            >
              Explorar Catálogo
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const isBusy = actionLoadingId === order.id;

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
                >
                  {/* Order Header */}
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {order.orderNumber}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>
                        Creado: {new Date(order.createdAt).toLocaleString()}
                      </span>
                      <span className="font-bold text-sm text-slate-900">
                        Total: {formatCurrency(order.totalCents)}
                      </span>
                    </div>
                  </div>

                  {/* Order Body */}
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Items & Customer Actions */}
                    <div className="lg:col-span-7 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Líneas del Pedido (SKUs)
                      </h4>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4 py-1">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="py-2.5 flex items-center justify-between text-xs gap-2"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 block">
                                {item.nameSnapshot}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                SKU: {item.skuSnapshot}
                              </span>
                              {(item.returnedToGood > 0 ||
                                item.returnedToDamaged > 0) && (
                                <div className="mt-1 flex items-center gap-2 text-[11px]">
                                  <span className="text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded font-medium">
                                    Reintegrado Apto: {item.returnedToGood}
                                  </span>
                                  <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded font-medium">
                                    Cuarentena/Dañado: {item.returnedToDamaged}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-right font-mono font-semibold text-slate-800">
                              {item.quantity} x{" "}
                              {formatCurrency(item.unitPriceCents)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                          <span>{order.notes}</span>
                        </div>
                      )}

                      {/* Contextual Customer Controls based on State Machine */}
                      <div className="pt-2">
                        {order.status === "PENDING_PAYMENT" && (
                          <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-indigo-600" />
                                Reserva activa hasta:{" "}
                                {new Date(
                                  order.reservationExpiresAt
                                ).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                disabled={isBusy}
                                onClick={() =>
                                  handlePayFromOrders(
                                    order.id,
                                    "payment_intent.succeeded",
                                    false
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                Confirmar Pago Ahora
                              </button>

                              <button
                                disabled={isBusy}
                                onClick={() =>
                                  handlePayFromOrders(
                                    order.id,
                                    "payment_intent.succeeded",
                                    true
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                              >
                                Simular Expiración TTL + Pago Tardío
                              </button>

                              <button
                                disabled={isBusy}
                                onClick={() =>
                                  handleCustomerTransition(
                                    order.id,
                                    "CANCELLED",
                                    "Cancelado directamente por el cliente antes de pagar"
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Cancelar y Liberar Stock
                              </button>
                            </div>
                          </div>
                        )}

                        {order.status === "PAID" && (
                          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-slate-600">
                              <span className="font-bold text-slate-900 block">
                                ¿Deseas cancelar antes de que Almacén inicie el
                                Picking?
                              </span>
                              Como el pedido sigue en{" "}
                              <code className="font-mono">PAID</code> (pre-picking),
                              puedes cancelarlo directamente; el stock volverá a{" "}
                              <code className="font-mono">available</code> y
                              pasará a reembolso.
                            </div>
                            <button
                              disabled={isBusy}
                              onClick={() =>
                                handleCustomerTransition(
                                  order.id,
                                  "REFUND_PENDING",
                                  "Cancelación solicitada por el cliente en estado PAID (antes de entrar a PROCESSING)"
                                )
                              }
                              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Cancelar Pedido (Pre-Picking)
                            </button>
                          </div>
                        )}

                        {(order.status === "PROCESSING" ||
                          order.status === "SHIPPED") && (
                          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between gap-3 text-xs text-slate-600">
                            <div className="flex items-center gap-2">
                              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                              <span>
                                <strong>Cancelación bloqueada:</strong> El
                                operador de almacén ya inició el{" "}
                                {order.status === "PROCESSING"
                                  ? "picking/empaque"
                                  : "despacho físico"}
                                . Deberás esperar la entrega para solicitar una
                                devolución.
                              </span>
                            </div>
                            {order.status === "SHIPPED" && (
                              <button
                                disabled={isBusy}
                                onClick={() =>
                                  handleCustomerTransition(
                                    order.id,
                                    "DELIVERED",
                                    "Recepción del paquete confirmada por el cliente"
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                                Confirmar Paquete Recibido
                              </button>
                            )}
                          </div>
                        )}

                        {order.status === "DELIVERED" && (
                          <div className="p-4 rounded-xl bg-orange-50/70 border border-orange-200 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-orange-950">
                              <span className="font-bold block">
                                Pedido Entregado — ¿Necesitas devolver un
                                artículo?
                              </span>
                              Al solicitar la devolución, el Operador de Almacén
                              recibirá e inspeccionará el producto para decidir
                              si vuelve a{" "}
                              <code className="font-mono">available</code> o{" "}
                              <code className="font-mono">damaged</code>.
                            </div>
                            <button
                              disabled={isBusy}
                              onClick={() =>
                                handleCustomerTransition(
                                  order.id,
                                  "RETURN_REQUESTED",
                                  "Cliente solicita devolución post-entrega para inspección en almacén"
                                )
                              }
                              className="px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Solicitar Devolución (RMA)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Order State Audit Log */}
                    <div className="lg:col-span-5 bg-slate-50 rounded-xl border border-slate-200 p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
                        <History className="w-3.5 h-3.5 text-indigo-600" />
                        Historial de Transiciones (Audit Log)
                      </h4>

                      <ol className="relative border-l border-slate-300 ml-2 space-y-3">
                        {order.stateHistory.map((h) => (
                          <li key={h.id} className="ml-4">
                            <div className="absolute w-2.5 h-2.5 bg-indigo-600 rounded-full -left-[5.5px] mt-1 border border-white" />
                            <div className="text-[11px] font-mono font-bold text-slate-800">
                              {h.fromStatus ? `${h.fromStatus} → ` : ""}
                              <span className="text-indigo-700">
                                {h.toStatus}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {h.reason}
                            </p>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              Rol: {h.actorRole} •{" "}
                              {new Date(h.createdAt).toLocaleTimeString()}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
