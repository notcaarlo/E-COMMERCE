"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Minus, Trash2, X } from "lucide-react";
import { useCart } from "./CartContext";
import { formatCurrency, OrderStatusBadge } from "./StatusBadge";
import type { SessionUser } from "@/lib/types/domain";

interface CartDrawerProps {
  user: SessionUser | null;
  onCheckoutSuccess?: () => void;
}

export function CartDrawer({ user, onCheckoutSuccess }: CartDrawerProps) {
  const router = useRouter();
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    activeOrder,
    setActiveOrder,
    updateQuantity,
    removeItem,
    clearCart,
    totalItems,
    totalCents,
  } = useCart();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    title: string;
    message: string;
  } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== "PENDING_PAYMENT") {
      setRemainingSeconds(0);
      return;
    }

    const updateTimer = () => {
      const expiresMs = new Date(activeOrder.reservationExpiresAt).getTime();
      const diffSec = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setRemainingSeconds(diffSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeOrder]);

  if (!isCartOpen) return null;

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleStartCheckout = async () => {
    setNotice(null);

    if (!user) {
      setIsCartOpen(false);
      router.push("/login");
      return;
    }

    if (user.role !== "CUSTOMER" && user.role !== "ADMIN") {
      setNotice({
        type: "error",
        title: "Cuenta operativa activa",
        message: `Has iniciado sesión como ${user.name}. Cambia a una cuenta de cliente para realizar compras.`,
      });
      return;
    }

    setCheckoutLoading(true);
    try {
      const idempotencyKey = `chk_${user.id}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          ttlSeconds: 900,
          items: cart.map((c) => ({
            variantId: c.variantId,
            quantity: c.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setNotice({
          type: "error",
          title: "No fue posible reservar el inventario",
          message:
            data.error ||
            "Otro comprador adquirió las unidades disponibles hace un momento.",
        });
        onCheckoutSuccess?.();
        return;
      }

      setActiveOrder(data.order);
      clearCart();
      setNotice({
        type: "info",
        title: `Reserva creada (${data.order.orderNumber})`,
        message:
          "Tus unidades quedaron apartadas en almacén durante 15 minutos para completar el pago.",
      });
      onCheckoutSuccess?.();
    } catch {
      setNotice({
        type: "error",
        title: "Error de conexión",
        message: "No se pudo comunicar con el servidor. Intenta de nuevo.",
      });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePaymentAction = async (
    eventType: "payment_intent.succeeded" | "payment_intent.payment_failed",
    forceExpireFirst = false
  ) => {
    if (!activeOrder) return;
    setWebhookLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          orderId: activeOrder.id,
          eventType,
          forceExpireFirst,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice({
          type: "error",
          title: "No se pudo procesar el pago",
          message: data.error || "Intenta nuevamente.",
        });
        return;
      }

      setActiveOrder(data.order);
      setNotice({
        type:
          data.outcome === "PAID_ON_TIME" ||
          data.outcome === "LATE_PAYMENT_REACTIVATED"
            ? "success"
            : "info",
        title:
          data.outcome === "PAID_ON_TIME"
            ? "Pago confirmado"
            : data.outcome === "LATE_PAYMENT_REACTIVATED"
            ? "Pago tardío reactivado"
            : "Estado de pago actualizado",
        message: data.message,
      });
      onCheckoutSuccess?.();
    } finally {
      setWebhookLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]">
      <div
        className="fixed inset-0"
        onClick={() => setIsCartOpen(false)}
        aria-hidden="true"
      />

      <aside className="relative z-10 w-full max-w-md bg-white h-full border-l border-[#DDDCDA] flex flex-col justify-between shadow-2xl">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-[#DDDCDA] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#141517]">
              Bolsa de compra
            </h2>
            <p className="text-xs text-[#52555A]">
              {totalItems} {totalItems === 1 ? "unidad guardada" : "unidades guardadas"} en esta sesión
            </p>
          </div>
          <button
            onClick={() => setIsCartOpen(false)}
            className="p-1.5 rounded text-[#52555A] hover:text-[#141517] hover:bg-[#EBEAE4] transition-colors cursor-pointer"
            aria-label="Cerrar bolsa"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {notice && (
            <div
              className={`p-3.5 rounded border text-xs space-y-1 ${
                notice.type === "success"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                  : notice.type === "error"
                  ? "bg-rose-50 border-rose-300 text-rose-950"
                  : "bg-blue-50 border-blue-300 text-blue-950"
              }`}
            >
              <div className="font-semibold">{notice.title}</div>
              <p className="leading-relaxed opacity-90">{notice.message}</p>
            </div>
          )}

          {/* Active Checkout Hold Section */}
          {activeOrder && (
            <div className="rounded border border-[#1D4ED8] bg-[#F7F7F5] overflow-hidden">
              <div className="bg-[#1D4ED8] text-white px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold font-mono">
                  {activeOrder.orderNumber}
                </span>
                {activeOrder.status === "PENDING_PAYMENT" ? (
                  <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded">
                    Reserva: {formatCountdown(remainingSeconds)}
                  </span>
                ) : (
                  <OrderStatusBadge status={activeOrder.status} />
                )}
              </div>

              <div className="p-4 space-y-3">
                <div className="divide-y divide-[#DDDCDA] text-xs">
                  {activeOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="py-1.5 flex items-center justify-between"
                    >
                      <span className="text-[#141517] font-medium">
                        {item.quantity} × {item.nameSnapshot}
                      </span>
                      <span className="font-mono text-[#141517]">
                        {formatCurrency(item.unitPriceCents * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#DDDCDA] flex items-center justify-between text-xs font-semibold text-[#141517]">
                  <span>Total reservado</span>
                  <span className="font-mono text-sm">
                    {formatCurrency(activeOrder.totalCents)}
                  </span>
                </div>

                {activeOrder.status === "PENDING_PAYMENT" ? (
                  <div className="space-y-2 pt-1">
                    <button
                      disabled={webhookLoading}
                      onClick={() =>
                        handlePaymentAction("payment_intent.succeeded", false)
                      }
                      className="w-full py-2 px-3 rounded bg-[#141517] hover:bg-[#2A2C30] text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Confirmar pago ahora
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={webhookLoading}
                        onClick={() =>
                          handlePaymentAction(
                            "payment_intent.payment_failed",
                            false
                          )
                        }
                        className="py-1.5 px-2.5 rounded bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 font-medium text-[11px] cursor-pointer disabled:opacity-50"
                      >
                        Simular rechazo
                      </button>
                      <button
                        disabled={webhookLoading}
                        onClick={() =>
                          handlePaymentAction("payment_intent.succeeded", true)
                        }
                        className="py-1.5 px-2.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-medium text-[11px] cursor-pointer disabled:opacity-50"
                      >
                        Probar pago tardío
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <Link
                      href="/orders"
                      onClick={() => setIsCartOpen(false)}
                      className="text-xs font-medium text-[#1D4ED8] hover:underline"
                    >
                      Ver seguimiento en Mis pedidos
                    </Link>
                    <button
                      onClick={() => setActiveOrder(null)}
                      className="text-xs text-[#52555A] hover:text-[#141517] cursor-pointer"
                    >
                      Limpiar aviso
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cart Items List */}
          {cart.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#141517]">
                Tu bolsa está vacía
              </p>
              <p className="text-xs text-[#52555A] max-w-[34ch] mx-auto leading-relaxed">
                Selecciona cualquier producto del catálogo para ver sus
                configuraciones y agregarlo a tu pedido.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#DDDCDA]">
              {cart.map((item) => (
                <div key={item.variantId} className="py-4 flex gap-3.5">
                  <Link
                    href={`/product/${item.productSlug}`}
                    onClick={() => setIsCartOpen(false)}
                    className="w-16 h-16 rounded bg-[#EBEAE4] border border-[#DDDCDA] overflow-hidden shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.productName}
                      className="w-full h-full object-cover"
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/product/${item.productSlug}`}
                        onClick={() => setIsCartOpen(false)}
                        className="text-xs font-semibold text-[#141517] hover:underline truncate"
                      >
                        {item.productName}
                      </Link>
                      <span className="text-xs font-mono font-semibold text-[#141517] shrink-0">
                        {formatCurrency(item.priceCents * item.quantity)}
                      </span>
                    </div>

                    <p className="text-xs text-[#52555A] mt-0.5">
                      {item.variantName}
                    </p>
                    <span className="font-mono text-[11px] text-[#52555A] block">
                      {item.sku}
                    </span>

                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-[#52555A]">
                        Máx. disp: {item.maxAvailable}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, -1)}
                          className="w-6 h-6 rounded border border-[#DDDCDA] flex items-center justify-center hover:bg-[#EBEAE4] cursor-pointer"
                          aria-label="Restar unidad"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-mono font-medium">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variantId, 1)}
                          className="w-6 h-6 rounded border border-[#DDDCDA] flex items-center justify-center hover:bg-[#EBEAE4] cursor-pointer"
                          aria-label="Sumar unidad"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId)}
                          className="ml-1 text-[#52555A] hover:text-rose-700 cursor-pointer"
                          aria-label="Eliminar artículo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        {cart.length > 0 && (
          <div className="p-6 border-t border-[#DDDCDA] bg-[#F7F7F5] space-y-3">
            <div className="flex items-baseline justify-between text-sm font-semibold text-[#141517]">
              <span>Subtotal</span>
              <span className="font-mono text-base">
                {formatCurrency(totalCents)}
              </span>
            </div>

            <button
              type="button"
              disabled={checkoutLoading}
              onClick={handleStartCheckout}
              className="w-full py-2.5 px-4 rounded bg-[#141517] hover:bg-[#2A2C30] text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {checkoutLoading
                ? "Reservando unidades..."
                : "Reservar unidades por 15 minutos y pagar"}
            </button>

            <p className="text-[11px] text-[#52555A] leading-relaxed">
              Las unidades se descuentan de disponibles al confirmar la reserva.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
