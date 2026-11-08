"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
        text: `El pedido ${data.order.orderNumber} cambió a estado ${data.order.status}.`,
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
          text: data.error || "No se pudo procesar el pago.",
        });
        return;
      }
      setBanner({
        type:
          data.outcome === "PAID_ON_TIME" ||
          data.outcome === "LATE_PAYMENT_REACTIVATED"
            ? "success"
            : "info",
        text: data.message,
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
        <div className="pb-6 mb-6 border-b border-[#DDDCDA] flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#141517]">
              Mis pedidos
            </h1>
            <p className="text-sm text-[#52555A] mt-1">
              Revisa el avance de tus compras, cancela antes de que entren a
              preparación de almacén o solicita una devolución tras la entrega.
            </p>
          </div>

          <button
            onClick={loadOrders}
            className="px-3.5 py-1.5 rounded text-xs font-medium bg-white border border-[#DDDCDA] hover:bg-[#EBEAE4] text-[#141517] cursor-pointer"
          >
            Actualizar lista
          </button>
        </div>

        {banner && (
          <div
            className={`mb-6 p-4 rounded border text-xs flex items-center justify-between ${
              banner.type === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                : banner.type === "error"
                ? "bg-rose-50 border-rose-300 text-rose-950"
                : "bg-blue-50 border-blue-300 text-blue-950"
            }`}
          >
            <span>{banner.text}</span>
            <button
              onClick={() => setBanner(null)}
              className="underline ml-4 cursor-pointer"
            >
              Ocultar
            </button>
          </div>
        )}

        {!user ? (
          <div className="bg-white rounded border border-[#DDDCDA] p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-[#141517]">
              Inicia sesión para consultar tus pedidos
            </p>
            <Link
              href="/login"
              className="inline-block px-4 py-2 rounded bg-[#141517] text-white text-xs font-medium"
            >
              Ir a Iniciar sesión
            </Link>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-44 rounded bg-white border border-[#DDDCDA] animate-pulse"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded border border-[#DDDCDA] p-10 space-y-3">
            <h2 className="text-base font-bold text-[#141517]">
              Todavía no tienes pedidos registrados
            </h2>
            <p className="text-xs text-[#52555A] max-w-[60ch]">
              Explora el catálogo y reserva cualquier artículo para ver aquí el
              seguimiento paso a paso de tu compra.
            </p>
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded bg-[#141517] hover:bg-[#2A2C30] text-white text-xs font-medium transition-colors"
            >
              Explorar el catálogo
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => {
              const isBusy = actionLoadingId === order.id;

              return (
                <article
                  key={order.id}
                  className="bg-white rounded border border-[#DDDCDA] overflow-hidden"
                >
                  {/* Order Header */}
                  <div className="px-6 py-3.5 bg-[#EBEAE4]/60 border-b border-[#DDDCDA] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-sm text-[#141517]">
                        {order.orderNumber}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[#52555A]">
                      <span>{new Date(order.createdAt).toLocaleString()}</span>
                      <span className="font-mono font-bold text-sm text-[#141517]">
                        Total: {formatCurrency(order.totalCents)}
                      </span>
                    </div>
                  </div>

                  {/* Order Body */}
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Items & Actions */}
                    <div className="lg:col-span-7 space-y-4">
                      <h3 className="text-xs font-semibold text-[#141517]">
                        Artículos incluidos
                      </h3>
                      <div className="divide-y divide-[#DDDCDA] border border-[#DDDCDA] rounded bg-[#F7F7F5] px-4">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="py-2.5 flex items-center justify-between text-xs gap-2"
                          >
                            <div>
                              <span className="font-medium text-[#141517] block">
                                {item.nameSnapshot}
                              </span>
                              <span className="font-mono text-[11px] text-[#52555A]">
                                Código: {item.skuSnapshot}
                              </span>
                              {(item.returnedToGood > 0 ||
                                item.returnedToDamaged > 0) && (
                                <div className="mt-1 flex items-center gap-2 text-[11px]">
                                  <span className="text-emerald-900 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    Reintegrado a venta: {item.returnedToGood}
                                  </span>
                                  <span className="text-rose-900 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                    En cuarentena: {item.returnedToDamaged}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-right font-mono font-medium text-[#141517]">
                              {item.quantity} ×{" "}
                              {formatCurrency(item.unitPriceCents)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {order.notes && (
                        <div className="p-3 rounded bg-amber-50 border border-amber-300 text-amber-950 text-xs">
                          {order.notes}
                        </div>
                      )}

                      {/* Contextual Customer Controls */}
                      <div>
                        {order.status === "PENDING_PAYMENT" && (
                          <div className="p-4 rounded bg-[#F7F7F5] border border-[#DDDCDA] space-y-3">
                            <p className="text-xs text-[#141517] font-medium">
                              Reserva vigente hasta las{" "}
                              <span className="font-mono">
                                {new Date(
                                  order.reservationExpiresAt
                                ).toLocaleTimeString()}
                              </span>
                            </p>
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
                                className="px-3.5 py-1.5 rounded bg-[#141517] hover:bg-[#2A2C30] text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                Confirmar pago ahora
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
                                className="px-3 py-1.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                Simular reserva vencida y pago tardío
                              </button>

                              <button
                                disabled={isBusy}
                                onClick={() =>
                                  handleCustomerTransition(
                                    order.id,
                                    "CANCELLED",
                                    "Cancelado por el cliente antes de confirmar el pago"
                                  )
                                }
                                className="px-3 py-1.5 rounded bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 text-xs font-medium cursor-pointer disabled:opacity-50"
                              >
                                Cancelar pedido y liberar unidades
                              </button>
                            </div>
                          </div>
                        )}

                        {order.status === "PAID" && (
                          <div className="p-4 rounded bg-[#F7F7F5] border border-[#DDDCDA] flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-[#52555A] max-w-[50ch]">
                              <span className="font-semibold text-[#141517] block">
                                Aún puedes cancelar directamente
                              </span>
                              Como el almacén todavía no ha iniciado la
                              preparación del paquete, puedes cancelar ahora para
                              liberar las unidades y recibir tu reembolso.
                            </div>
                            <button
                              disabled={isBusy}
                              onClick={() =>
                                handleCustomerTransition(
                                  order.id,
                                  "REFUND_PENDING",
                                  "Cancelación solicitada por el cliente antes de entrar a preparación"
                                )
                              }
                              className="px-3.5 py-1.5 rounded bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 text-xs font-medium cursor-pointer disabled:opacity-50"
                            >
                              Cancelar pedido
                            </button>
                          </div>
                        )}

                        {(order.status === "PROCESSING" ||
                          order.status === "SHIPPED") && (
                          <div className="p-3.5 rounded bg-[#F7F7F5] border border-[#DDDCDA] flex flex-wrap items-center justify-between gap-3 text-xs text-[#52555A]">
                            <p className="max-w-[52ch]">
                              <strong className="text-[#141517]">
                                Cancelación directa deshabilitada:
                              </strong>{" "}
                              El almacén ya inició{" "}
                              {order.status === "PROCESSING"
                                ? "la preparación del pedido"
                                : "el envío"}
                              . Una vez entregado podrás solicitar una
                              devolución si lo necesitas.
                            </p>
                            {order.status === "SHIPPED" && (
                              <button
                                disabled={isBusy}
                                onClick={() =>
                                  handleCustomerTransition(
                                    order.id,
                                    "DELIVERED",
                                    "Entrega confirmada por el cliente"
                                  )
                                }
                                className="px-3 py-1.5 rounded bg-[#141517] text-white text-xs font-medium shrink-0 cursor-pointer"
                              >
                                Confirmar que recibí el paquete
                              </button>
                            )}
                          </div>
                        )}

                        {order.status === "DELIVERED" && (
                          <div className="p-4 rounded bg-[#F7F7F5] border border-[#DDDCDA] flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-[#52555A] max-w-[50ch]">
                              <span className="font-semibold text-[#141517] block">
                                ¿Necesitas devolver un artículo?
                              </span>
                              Al solicitar la devolución, el operador de almacén
                              inspeccionará el estado físico del producto al
                              recibirlo.
                            </div>
                            <button
                              disabled={isBusy}
                              onClick={() =>
                                handleCustomerTransition(
                                  order.id,
                                  "RETURN_REQUESTED",
                                  "Devolución solicitada por el cliente después de la entrega"
                                )
                              }
                              className="px-3.5 py-1.5 rounded bg-white hover:bg-[#EBEAE4] text-[#141517] border border-[#DDDCDA] text-xs font-medium cursor-pointer disabled:opacity-50"
                            >
                              Solicitar devolución
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Order State History */}
                    <div className="lg:col-span-5 bg-[#F7F7F5] rounded border border-[#DDDCDA] p-4">
                      <h3 className="text-xs font-semibold text-[#141517] mb-3">
                        Historial del pedido
                      </h3>

                      <ol className="relative border-l border-[#DDDCDA] ml-2 space-y-3">
                        {order.stateHistory.map((h) => (
                          <li key={h.id} className="ml-4">
                            <div className="absolute w-2 h-2 bg-[#141517] rounded-full -left-[4.5px] mt-1.5" />
                            <div className="text-xs font-medium text-[#141517]">
                              {h.fromStatus
                                ? `${h.fromStatus} a ${h.toStatus}`
                                : h.toStatus}
                            </div>
                            <p className="text-xs text-[#52555A] mt-0.5">
                              {h.reason}
                            </p>
                            <span className="text-[11px] font-mono text-[#52555A] block mt-0.5">
                              {h.actorRole} ·{" "}
                              {new Date(h.createdAt).toLocaleTimeString()}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
