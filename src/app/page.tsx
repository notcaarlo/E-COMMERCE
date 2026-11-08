"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Minus,
  Trash2,
  RefreshCw,
  CreditCard,
  Zap,
  Lock,
  ArrowRight,
  Package,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { formatCurrency, OrderStatusBadge } from "@/components/StatusBadge";
import type {
  OrderDTO,
  ProductDTO,
  ProductVariantDTO,
  SessionUser,
} from "@/lib/types/domain";

interface CartItem {
  variant: ProductVariantDTO;
  productName: string;
  imageUrl: string;
  quantity: number;
}

export default function ShopPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState<
    Record<string, string>
  >({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderDTO | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    title: string;
    message: string;
  } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const loadInitialData = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [meRes, catRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/catalog"),
      ]);
      const meData = await meRes.json();
      const catData = await catRes.json();

      setUser(meData.user ?? null);
      const prods: ProductDTO[] = catData.products ?? [];
      setProducts(prods);

      setSelectedVariantByProduct((prev) => {
        const next = { ...prev };
        for (const p of prods) {
          if (!next[p.id] && p.variants[0]) {
            next[p.id] = p.variants[0].id;
          }
        }
        return next;
      });
    } catch {
      // ignore
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Countdown timer for active checkout reservation
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

  const addToCart = (product: ProductDTO, variant: ProductVariantDTO) => {
    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((c) => c.variant.id === variant.id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty + 1 > variant.inventory.available) {
        setFeedback({
          type: "error",
          title: "Límite de Stock Disponible",
          message: `Solo quedan ${variant.inventory.available} unidades libres para ${variant.sku}.`,
        });
        return prev;
      }
      if (existing) {
        return prev.map((c) =>
          c.variant.id === variant.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          variant,
          productName: product.name,
          imageUrl: product.imageUrl,
          quantity: 1,
        },
      ];
    });
  };

  const updateCartQty = (variantId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variant.id !== variantId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty > item.variant.inventory.available) {
            return item;
          }
          return { ...item, quantity: nextQty };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const cartTotalCents = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + item.variant.priceCents * item.quantity,
        0
      ),
    [cart]
  );

  const handleStartCheckout = async () => {
    setFeedback(null);

    if (!user) {
      router.push("/login");
      return;
    }

    if (user.role !== "CUSTOMER" && user.role !== "ADMIN") {
      setFeedback({
        type: "error",
        title: "Rol de Backoffice Activo",
        message: `Has iniciado sesión como ${user.role}. Cambia al rol CUSTOMER en /login para realizar compras en la tienda.`,
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
          ttlSeconds: 900, // 15 minutes reservation TTL
          items: cart.map((c) => ({
            variantId: c.variant.id,
            quantity: c.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          title: "Checkout Rechazado por Control de Stock (ACID)",
          message: data.error || "No se pudo reservar el inventario.",
        });
        await loadInitialData();
        return;
      }

      setActiveOrder(data.order);
      setCart([]);
      setFeedback({
        type: "info",
        title: `Reserva Creada: ${data.order.orderNumber}`,
        message:
          "El stock ha sido bloqueado atómicamente (SELECT ... FOR UPDATE). Tienes 15 minutos para confirmar el pago antes de que vuelva a 'available'.",
      });
      await loadInitialData();
    } catch {
      setFeedback({
        type: "error",
        title: "Error de Red",
        message: "No se pudo conectar con el servidor de checkout.",
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
    setFeedback(null);
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
        setFeedback({
          type: "error",
          title: "Error en Webhook de Pago",
          message: data.error || "No se pudo procesar el evento de pago.",
        });
        return;
      }

      setActiveOrder(data.order);
      setFeedback({
        type:
          data.outcome === "PAID_ON_TIME" ||
          data.outcome === "LATE_PAYMENT_REACTIVATED"
            ? "success"
            : "info",
        title: `Resultado Webhook: ${data.outcome}`,
        message: data.message,
      });
      await loadInitialData();
    } finally {
      setWebhookLoading(false);
    }
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar user={user} onUserChange={setUser} />

      {/* Top Architecture Banner */}
      <div className="bg-slate-900 text-slate-200 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Motor PostgreSQL ACID Activo
            </span>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="text-slate-300">
              Locking:{" "}
              <code className="text-amber-300 font-mono">
                SELECT ... FOR UPDATE
              </code>
            </span>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="text-slate-300">
              Invariante:{" "}
              <code className="text-emerald-300 font-mono">
                on_hand = available + reserved
              </code>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadInitialData}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sincronizar Stock
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {feedback && (
          <div
            className={`mb-6 p-4 rounded-xl border flex items-start justify-between gap-3 ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : feedback.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-indigo-50 border-indigo-200 text-indigo-900"
            }`}
          >
            <div className="flex items-start gap-3">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : feedback.type === "error" ? (
                <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              )}
              <div>
                <h3 className="text-sm font-bold">{feedback.title}</h3>
                <p className="text-xs mt-0.5 leading-relaxed">
                  {feedback.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Active Checkout Reservation / Payment Gateway Banner */}
        {activeOrder && (
          <div className="mb-8 bg-white rounded-2xl border-2 border-indigo-600 shadow-md overflow-hidden">
            <div className="bg-indigo-600 text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-5 h-5" />
                <div>
                  <span className="font-bold text-sm">
                    Pasarela de Pago &amp; Reserva de Stock —{" "}
                    {activeOrder.orderNumber}
                  </span>
                  <span className="block text-[11px] text-indigo-100">
                    Idempotency Key: {activeOrder.idempotencyKey}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <OrderStatusBadge status={activeOrder.status} />
                {activeOrder.status === "PENDING_PAYMENT" && (
                  <div className="flex items-center gap-1.5 bg-indigo-900/60 px-3 py-1 rounded-full text-xs font-mono font-bold">
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    TTL: {formatCountdown(remainingSeconds)}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-6 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Unidades Retenidas en `reserved`
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4 py-2 bg-slate-50">
                  {activeOrder.items.map((item) => (
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
                      <div className="font-semibold text-slate-900">
                        {item.quantity} x {formatCurrency(item.unitPriceCents)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1 text-sm font-bold text-slate-900">
                  <span>Total del Pedido:</span>
                  <span className="text-base text-indigo-600">
                    {formatCurrency(activeOrder.totalCents)}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-6 flex flex-col gap-3">
                {activeOrder.status === "PENDING_PAYMENT" ? (
                  <>
                    <p className="text-xs text-slate-600">
                      El stock ya fue descontado de{" "}
                      <code className="font-mono bg-slate-100 px-1 rounded">
                        available
                      </code>{" "}
                      y movido a{" "}
                      <code className="font-mono bg-amber-100 text-amber-900 px-1 rounded">
                        reserved
                      </code>
                      . Dispara el webhook de la pasarela de pago:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        disabled={webhookLoading}
                        onClick={() =>
                          handlePaymentAction("payment_intent.succeeded", false)
                        }
                        className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Confirmar Pago Exitoso (PAID)
                      </button>

                      <button
                        disabled={webhookLoading}
                        onClick={() =>
                          handlePaymentAction(
                            "payment_intent.payment_failed",
                            false
                          )
                        }
                        className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Simular Pago Fallido (Libera Stock)
                      </button>
                    </div>

                    <button
                      disabled={webhookLoading}
                      onClick={() =>
                        handlePaymentAction("payment_intent.succeeded", true)
                      }
                      className="py-2 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="w-4 h-4 text-amber-600" />
                      Simular Race Condition: Expirar TTL primero + Recibir
                      Webhook de Pago Tardío
                    </button>
                  </>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-slate-700 space-y-1">
                      <div className="font-bold text-slate-900">
                        Pedido en estado: {activeOrder.status}
                      </div>
                      <p>
                        Puedes gestionar este pedido, ver su bitácora de
                        auditoría o continuar el flujo en Mis Pedidos o en el
                        Backoffice.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => router.push("/orders")}
                        className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        Ver en Mis Pedidos
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setActiveOrder(null)}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-medium cursor-pointer"
                      >
                        Ocultar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Product Catalog Grid */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Catálogo de Hardware &amp; Periféricos
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Selecciona una variante (SKU) para inspeccionar su saldo exacto{" "}
                  <code className="font-mono text-slate-700">available</code> vs{" "}
                  <code className="font-mono text-slate-700">reserved</code> en
                  tiempo real.
                </p>
              </div>
            </div>

            {loadingCatalog ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-96 rounded-2xl bg-white border border-slate-200 p-5 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {products.map((product) => {
                  const selectedVarId =
                    selectedVariantByProduct[product.id] ??
                    product.variants[0]?.id;
                  const activeVariant =
                    product.variants.find((v) => v.id === selectedVarId) ??
                    product.variants[0];

                  if (!activeVariant) return null;

                  const inv = activeVariant.inventory;
                  const isOutOfStock = inv.available <= 0;
                  const isLowStock = inv.available > 0 && inv.available <= 3;

                  return (
                    <div
                      key={product.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col"
                    >
                      <div className="relative h-48 bg-slate-100 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur text-white text-[11px] font-medium px-2.5 py-1 rounded-full">
                          {product.category}
                        </span>

                        <div className="absolute top-3 right-3">
                          {isOutOfStock ? (
                            <span className="bg-rose-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-xs">
                              Agotado (0 disp.)
                            </span>
                          ) : isLowStock ? (
                            <span className="bg-amber-500 text-slate-950 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-xs">
                              ¡Últimas {inv.available} uds!
                            </span>
                          ) : (
                            <span className="bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-xs">
                              {inv.available} disponibles
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div>
                          <h2 className="font-bold text-slate-900 text-base leading-snug">
                            {product.name}
                          </h2>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {product.description}
                          </p>

                          {/* Variant Selector */}
                          <div className="mt-4">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                              Variante / SKU ({product.variants.length})
                            </label>
                            <div className="flex flex-col gap-1.5">
                              {product.variants.map((v) => {
                                const isSelected = v.id === activeVariant.id;
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() =>
                                      setSelectedVariantByProduct((prev) => ({
                                        ...prev,
                                        [product.id]: v.id,
                                      }))
                                    }
                                    className={`text-left px-3 py-2 rounded-xl border text-xs transition-all flex items-center justify-between cursor-pointer ${
                                      isSelected
                                        ? "border-indigo-600 bg-indigo-50/50 text-indigo-950 font-semibold"
                                        : "border-slate-200 hover:border-slate-300 text-slate-700"
                                    }`}
                                  >
                                    <div className="truncate pr-2">
                                      <span className="block truncate">
                                        {v.name}
                                      </span>
                                      <span className="font-mono text-[10px] text-slate-500">
                                        SKU: {v.sku}
                                      </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="block font-bold text-slate-900">
                                        {formatCurrency(v.priceCents)}
                                      </span>
                                      <span
                                        className={`text-[10px] font-mono ${
                                          v.inventory.available === 0
                                            ? "text-rose-600 font-bold"
                                            : "text-emerald-700"
                                        }`}
                                      >
                                        Disp: {v.inventory.available} | Res:{" "}
                                        {v.inventory.reserved}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Real-time Stock Counters Bar & Add to Cart */}
                        <div className="pt-3 border-t border-slate-100 space-y-3">
                          <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-50 rounded-lg p-2 border border-slate-200/80 text-[11px]">
                            <div>
                              <span className="text-slate-400 block">
                                Físico (OnHand)
                              </span>
                              <span className="font-mono font-bold text-slate-800">
                                {inv.onHand}
                              </span>
                            </div>
                            <div className="border-x border-slate-200">
                              <span className="text-slate-400 block">
                                Libre (Avail)
                              </span>
                              <span className="font-mono font-bold text-emerald-600">
                                {inv.available}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">
                                Retenido (Res)
                              </span>
                              <span className="font-mono font-bold text-amber-600">
                                {inv.reserved}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-xs text-slate-400 block">
                                Precio Unitario
                              </span>
                              <span className="text-lg font-extrabold text-slate-900">
                                {formatCurrency(activeVariant.priceCents)}
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => addToCart(product, activeVariant)}
                              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ShoppingCart className="w-4 h-4" />
                              {isOutOfStock
                                ? "Sin Stock Libre"
                                : "Agregar al Carrito"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Sticky Sidebar: Shopping Cart & Checkout Reservation */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-indigo-600" />
                  <h2 className="font-bold text-slate-900 text-base">
                    Carrito de Compra
                  </h2>
                </div>
                <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                  {cart.reduce((s, c) => s + c.quantity, 0)} uds
                </span>
              </div>

              {cart.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Package className="w-9 h-9 text-slate-300 mx-auto" />
                  <p className="text-sm font-medium text-slate-600">
                    Tu carrito está vacío
                  </p>
                  <p className="text-xs text-slate-400">
                    El stock aún NO se reserva al agregar al carrito. La reserva
                    atómica ocurre al iniciar el Checkout.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div key={item.variant.id} className="py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">
                              {item.productName}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {item.variant.name}
                            </p>
                            <span className="inline-block text-[10px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-0.5">
                              {item.variant.sku}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-slate-900">
                            {formatCurrency(
                              item.variant.priceCents * item.quantity
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">
                            Máx disp: {item.variant.inventory.available}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateCartQty(item.variant.id, -1)
                              }
                              className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-mono font-bold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.variant.id, 1)}
                              className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateCartQty(
                                  item.variant.id,
                                  -item.quantity
                                )
                              }
                              className="ml-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between text-sm font-bold text-slate-900">
                      <span>Total a Reservar</span>
                      <span className="text-lg text-indigo-600">
                        {formatCurrency(cartTotalCents)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={checkoutLoading}
                      onClick={handleStartCheckout}
                      className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Lock className="w-4 h-4" />
                      {checkoutLoading
                        ? "Adquiriendo Locks FOR UPDATE..."
                        : "Iniciar Checkout y Reservar Stock (TTL 15m)"}
                    </button>

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Al pulsar, se ejecuta una transacción ACID en PostgreSQL:
                      ordena los SKUs para prevenir deadlocks, libera reservas
                      vencidas (Lazy Release) y retiene tus unidades por 15
                      minutos.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
