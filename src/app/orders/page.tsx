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
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} onUserChange={setUser} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-white flex items-center gap-2.5">
              <PackageCheck className="w-6 h-6 text-amber-400" />
              MIS PEDIDOS &amp; TRAZABILIDAD DE ESTADOS
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Consulta el estado en tiempo real, cancela antes de que Almacén
              inicie el picking o solicita devoluciones RMA.
            </p>
          </div>

          <button
            onClick={loadOrders}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-mono font-bold bg-[#11151F] border border-white/15 hover:border-amber-500/50 text-slate-200 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            ACTUALIZAR
          </button>
        </div>

        {banner && (
          <div
            className={`mb-6 p-4 rounded-xl border text-xs font-mono font-medium flex items-center justify-between ${
              banner.type === "success"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                : banner.type === "error"
                ? "bg-rose-500/15 border-rose-500/40 text-rose-200"
                : "bg-amber-500/15 border-amber-500/40 text-amber-200"
            }`}
          >
            <span>{banner.text}</span>
            <button
              onClick={() => setBanner(null)}
              className="font-bold ml-4 cursor-pointer"
            >
              [X]
            </button>
          </div>
        )}

        {!user ? (
          <div className="bg-[#11151F] rounded-2xl border border-white/10 p-10 text-center space-y-3">
            <p className="text-sm font-display font-bold text-white">
              INICIA SESIÓN PARA VER TUS PEDIDOS
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-[#090B10] text-xs font-mono font-bold"
            >
              IR A CONTROL DE ACCESO
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-48 rounded-2xl bg-[#11151F] border border-white/10 animate-pulse"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-[#11151F] rounded-2xl border border-white/10 p-12 text-center space-y-3">
            <PackageCheck className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="font-display text-base font-bold text-white">
              SIN PEDIDOS REGISTRADOS
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Ve al catálogo de hardware, selecciona un SKU e inicia el Checkout
              para crear una reserva con TTL en PostgreSQL.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#090B10] text-xs font-mono font-bold transition-colors"
            >
              EXPLORAR CATÁLOGO
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const isBusy = actionLoadingId === order.id;

              return (
                <div
                  key={order.id}
                  className="bg-[#11151F] rounded-2xl border border-white/10 shadow-xl overflow-hidden animate-fade-up"
                >
                  {/* Order Header */}
                  <div className="px-6 py-4 bg-[#0B0E15] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-amber-400">
                        {order.orderNumber}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                      <span>
                        TIMESTAMP: {new Date(order.createdAt).toLocaleString()}
                      </span>
                      <span className="font-bold text-sm text-white">
                        TOTAL: {formatCurrency(order.totalCents)}
                      </span>
                    </div>
                  </div>

                  {/* Order Body */}
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Items & Customer Actions */}
                    <div className="lg:col-span-7 space-y-4">
                      <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-400">
                        LÍNEAS DEL PEDIDO (SKUs)
                      </h4>
                      <div className="divide-y divide-white/10 border border-white/10 rounded-xl px-4 py-1 bg-[#0B0E15]">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="py-2.5 flex items-center justify-between text-xs gap-2"
                          >
                            <div>
                              <span className="font-semibold text-white block">
                                {item.nameSnapshot}
                              </span>
                              <span className="font-mono text-[11px] text-amber-400">
                                SKU: {item.skuSnapshot}
                              </span>
                              {(item.returnedToGood > 0 ||
                                item.returnedToDamaged > 0) && (
                                <div className="mt-1 flex items-center gap-2 text-[10px] font-mono">
                                  <span className="text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                    REINTEGRADO APTO: {item.returnedToGood}
                                  </span>
                                  <span className="text-rose-300 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded">
                                    CUARENTENA/DAÑADO: {item.returnedToDamaged}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-right font-mono font-semibold text-slate-200">
                              {item.quantity} ×{" "}
                              {formatCurrency(item.unitPriceCents)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                          <span>{order.notes}</span>
                        </div>
                      )}

                      {/* Contextual Customer Controls based on State Machine */}
                      <div className="pt-2">
                        {order.status === "PENDING_PAYMENT" && (
                          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-amber-400" />
                                RESERVA ACTIVA HASTA:{" "}
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
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#090B10] text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                CONFIRMAR PAGO AHORA
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
                                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-mono font-semibold cursor-pointer disabled:opacity-50"
                              >
                                SIMULAR EXPIRACIÓN TTL + PAGO TARDÍO
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
                                className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-mono font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                CANCELAR Y LIBERAR STOCK
                              </button>
                            </div>
                          </div>
                        )}

                        {order.status === "PAID" && (
                          <div className="p-4 rounded-xl bg-[#0B0E15] border border-white/10 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-slate-400">
                              <span className="font-bold text-white block">
                                ¿Cancelar antes de que Almacén inicie el
                                Picking?
                              </span>
                              Como el pedido sigue en{" "}
                              <code className="font-mono text-sky-400">
                                PAID
                              </code>{" "}
                              (pre-picking), puedes cancelarlo; el stock volverá
                              a{" "}
                              <code className="font-mono text-emerald-400">
                                available
                              </code>{" "}
                              y pasará a reembolso.
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
                              className="px-3.5 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              CANCELAR PEDIDO (PRE-PICKING)
                            </button>
                          </div>
                        )}

                        {(order.status === "PROCESSING" ||
                          order.status === "SHIPPED") && (
                          <div className="p-3.5 rounded-xl bg-[#0B0E15] border border-white/10 flex items-center justify-between gap-3 text-xs text-slate-400">
                            <div className="flex items-center gap-2">
                              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                              <span>
                                <strong className="text-white">
                                  CANCELACIÓN BLOQUEADA:
                                </strong>{" "}
                                El operador de almacén ya inició el{" "}
                                {order.status === "PROCESSING"
                                  ? "picking/empaque"
                                  : "despacho físico"}
                                . Deberás esperar la entrega para solicitar una
                                devolución RMA.
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
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#090B10] text-xs font-mono font-bold shrink-0 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                                CONFIRMAR RECEPCIÓN
                              </button>
                            )}
                          </div>
                        )}

                        {order.status === "DELIVERED" && (
                          <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-orange-200">
                              <span className="font-bold text-white block">
                                PEDIDO ENTREGADO — ¿SOLICITAR DEVOLUCIÓN RMA?
                              </span>
                              El Operador de Almacén recibirá e inspeccionará el
                              producto físicamente para decidir si vuelve a{" "}
                              <code className="font-mono text-emerald-300">
                                available
                              </code>{" "}
                              o{" "}
                              <code className="font-mono text-rose-300">
                                damaged
                              </code>
                              .
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
                              className="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-[#090B10] text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              SOLICITAR DEVOLUCIÓN (RMA)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Order State Audit Log */}
                    <div className="lg:col-span-5 bg-[#0B0E15] rounded-xl border border-white/10 p-4">
                      <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">
                        <History className="w-3.5 h-3.5 text-amber-400" />
                        ORDER STATE AUDIT LOG
                      </h4>

                      <ol className="relative border-l border-white/15 ml-2 space-y-3">
                        {order.stateHistory.map((h) => (
                          <li key={h.id} className="ml-4">
                            <div className="absolute w-2.5 h-2.5 bg-amber-400 rounded-full -left-[5.5px] mt-1 border border-[#090B10]" />
                            <div className="text-[11px] font-mono font-bold text-slate-300">
                              {h.fromStatus ? `${h.fromStatus} → ` : ""}
                              <span className="text-amber-400">
                                {h.toStatus}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {h.reason}
                            </p>
                            <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                              ACTOR: {h.actorRole} •{" "}
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
