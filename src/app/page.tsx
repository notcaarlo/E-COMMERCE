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
  Activity,
  Terminal,
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
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
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

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return ["ALL", ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === "ALL") return products;
    return products.filter((p) => p.category === selectedCategory);
  }, [products, selectedCategory]);

  const addToCart = (product: ProductDTO, variant: ProductVariantDTO) => {
    setFeedback(null);
    setCart((prev) => {
      const existing = prev.find((c) => c.variant.id === variant.id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty + 1 > variant.inventory.available) {
        setFeedback({
          type: "error",
          title: "LÍMITE DE STOCK DISPONIBLE ALCANZADO",
          message: `Solo quedan ${variant.inventory.available} unidades libres para el SKU ${variant.sku}.`,
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
        title: "SESIÓN OPERATIVA DE BACKOFFICE DETECTADA",
        message: `Estás autenticado como ${user.role}. Cambia al rol CUSTOMER en /login para realizar compras en la tienda.`,
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
          title: "TRANSACCIÓN RECHAZADA POR CONTROL DE STOCK (ACID)",
          message: data.error || "No se pudo reservar el inventario.",
        });
        await loadInitialData();
        return;
      }

      setActiveOrder(data.order);
      setCart([]);
      setFeedback({
        type: "info",
        title: `RESERVA BLOQUEADA ATÓMICAMENTE // ${data.order.orderNumber}`,
        message:
          "PostgreSQL adquirió el lock (SELECT ... FOR UPDATE) y transfirió tus unidades de 'available' a 'reserved' por 15 minutos.",
      });
      await loadInitialData();
    } catch {
      setFeedback({
        type: "error",
        title: "ERROR DE CONEXIÓN",
        message: "No se pudo conectar con el motor transaccional.",
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
          title: "ERROR EN WEBHOOK DE PASARELA",
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
        title: `WEBHOOK PROCESADO // ${data.outcome}`,
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
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} onUserChange={setUser} />

      {/* Top Engineering Telemetry Bar */}
      <div className="bg-[#0D1018]/90 border-b border-white/10 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <ShieldCheck className="w-4 h-4" />
              POSTGRESQL ACID ENGINE: ONLINE
            </span>
            <span className="text-white/20 hidden sm:inline">/</span>
            <span className="text-slate-300">
              ISOLATION:{" "}
              <code className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                SELECT ... FOR UPDATE
              </code>
            </span>
            <span className="text-white/20 hidden md:inline">/</span>
            <span className="text-slate-300 hidden md:inline">
              INVARIANT:{" "}
              <code className="text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                on_hand = available + reserved
              </code>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadInitialData}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              SYNC TELEMETRÍA
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Header Section */}
        <div className="mb-8 p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-[#131824] via-[#10141E] to-[#0B0E15] border border-white/10 shadow-2xl relative overflow-hidden animate-fade-up">
          <div className="absolute -right-16 -top-16 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-2xl space-y-2.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-semibold uppercase tracking-widest">
                <Activity className="w-3.5 h-3.5" />
                Zero-Overselling Hardware Storefront
              </div>
              <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                PRECISION HARDWARE.{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500">
                  STRICT STOCK CONTROL.
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Cada variante SKU refleja en vivo sus contadores{" "}
                <code className="font-mono text-slate-200">on_hand</code>,{" "}
                <code className="font-mono text-emerald-400">available</code> y{" "}
                <code className="font-mono text-amber-400">reserved</code>. Al
                iniciar el Checkout, se bloquea la fila con TTL de 15 minutos y
                se audita en el Kardex inmutable.
              </p>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-amber-500 text-[#090B10] shadow-[0_0_15px_rgba(245,158,11,0.35)]"
                      : "bg-white/5 text-slate-400 border border-white/10 hover:text-white hover:border-white/20"
                  }`}
                >
                  {cat === "ALL" ? "TODOS LOS SKUs" : cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`mb-6 p-4 rounded-xl border flex items-start justify-between gap-3 animate-fade-up ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200"
                : feedback.type === "error"
                ? "bg-rose-500/10 border-rose-500/40 text-rose-200"
                : "bg-amber-500/10 border-amber-500/40 text-amber-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : feedback.type === "error" ? (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div>
                <h3 className="text-xs font-mono font-bold tracking-wider uppercase">
                  {feedback.title}
                </h3>
                <p className="text-xs mt-1 text-slate-300 leading-relaxed">
                  {feedback.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs font-mono font-semibold text-slate-400 hover:text-white cursor-pointer"
            >
              [ESC]
            </button>
          </div>
        )}

        {/* Active Checkout Reservation / Payment Gateway Terminal */}
        {activeOrder && (
          <div className="mb-8 bg-[#11151F] rounded-2xl border-2 border-amber-500/70 shadow-[0_0_40px_rgba(245,158,11,0.12)] overflow-hidden animate-fade-up">
            <div className="bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-b border-amber-500/30 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500 text-[#090B10] flex items-center justify-center font-bold">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-display font-bold text-white text-sm tracking-wide block">
                    TERMINAL DE PAGO &amp; RESERVA ACTIVA //{" "}
                    <span className="text-amber-400 font-mono">
                      {activeOrder.orderNumber}
                    </span>
                  </span>
                  <span className="block text-[11px] text-slate-400 font-mono">
                    IDEMPOTENCY_KEY: {activeOrder.idempotencyKey}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <OrderStatusBadge status={activeOrder.status} />
                {activeOrder.status === "PENDING_PAYMENT" && (
                  <div className="flex items-center gap-1.5 bg-[#090B10] border border-amber-500/40 px-3 py-1 rounded-md text-xs font-mono font-bold text-amber-400">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    TTL: {formatCountdown(remainingSeconds)}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-6 space-y-2.5">
                <h4 className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-400">
                  UNIDADES RETENIDAS EN `RESERVED`
                </h4>
                <div className="divide-y divide-white/10 border border-white/10 rounded-xl px-4 py-2 bg-[#0B0E15]">
                  {activeOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-white">
                          {item.nameSnapshot}
                        </span>
                        <span className="ml-2 font-mono text-amber-400">
                          [{item.skuSnapshot}]
                        </span>
                      </div>
                      <div className="font-mono font-bold text-slate-200">
                        {item.quantity} × {formatCurrency(item.unitPriceCents)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1 text-sm font-mono font-bold text-white">
                  <span>IMPORTE TOTAL BLOQUEADO:</span>
                  <span className="text-lg text-amber-400">
                    {formatCurrency(activeOrder.totalCents)}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-6 flex flex-col gap-3">
                {activeOrder.status === "PENDING_PAYMENT" ? (
                  <>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      El stock ya fue transferido de{" "}
                      <code className="font-mono text-emerald-400">
                        available
                      </code>{" "}
                      a{" "}
                      <code className="font-mono text-amber-400">reserved</code>
                      . Dispara el webhook firmado de la pasarela para probar la
                      máquina de estados:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        disabled={webhookLoading}
                        onClick={() =>
                          handlePaymentAction("payment_intent.succeeded", false)
                        }
                        className="py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#090B10] font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        CONFIRMAR PAGO (→ PAID)
                      </button>

                      <button
                        disabled={webhookLoading}
                        onClick={() =>
                          handlePaymentAction(
                            "payment_intent.payment_failed",
                            false
                          )
                        }
                        className="py-2.5 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        FALLO BANCARIO (LIBERA STOCK)
                      </button>
                    </div>

                    <button
                      disabled={webhookLoading}
                      onClick={() =>
                        handlePaymentAction("payment_intent.succeeded", true)
                      }
                      className="py-2.5 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 font-mono font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="w-4 h-4 text-amber-400" />
                      RACE CONDITION: EXPIRAR TTL PRIMERO + WEBHOOK TARDÍO
                    </button>
                  </>
                ) : (
                  <div className="bg-[#0B0E15] border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-slate-300 space-y-1">
                      <div className="font-mono font-bold text-white">
                        ESTADO ACTUAL: {activeOrder.status}
                      </div>
                      <p className="text-slate-400">
                        Inspecciona el Audit Log en Mis Pedidos o continúa el
                        flujo de almacén en el Backoffice.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => router.push("/orders")}
                        className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090B10] text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        VER PEDIDO
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setActiveOrder(null)}
                        className="px-3 py-2 rounded-lg border border-white/15 text-slate-400 hover:text-white text-xs font-mono cursor-pointer"
                      >
                        CERRAR
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
          <div className="lg:col-span-8">
            {loadingCatalog ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-[440px] rounded-2xl bg-[#11151F] border border-white/10 p-5 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {filteredProducts.map((product, index) => {
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
                  const availPercent =
                    inv.onHand > 0
                      ? Math.round((inv.available / inv.onHand) * 100)
                      : 0;

                  return (
                    <div
                      key={product.id}
                      style={{ animationDelay: `${index * 60}ms` }}
                      className="bg-[#11151F] rounded-2xl border border-white/10 hover:border-amber-500/40 shadow-xl transition-all duration-300 overflow-hidden flex flex-col group animate-fade-up"
                    >
                      <div className="relative h-48 bg-[#090B10] overflow-hidden border-b border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover opacity-85 group-hover:scale-105 group-hover:opacity-100 transition-all duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#11151F] via-transparent to-transparent" />

                        <span className="absolute top-3 left-3 bg-[#090B10]/85 backdrop-blur-md text-slate-200 border border-white/15 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded">
                          {product.category}
                        </span>

                        <div className="absolute top-3 right-3">
                          {isOutOfStock ? (
                            <span className="bg-rose-500/90 text-white text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded shadow-lg">
                              AGOTADO · 0 DISP
                            </span>
                          ) : isLowStock ? (
                            <span className="bg-amber-500 text-[#090B10] text-[10px] font-mono font-extrabold uppercase tracking-wider px-2.5 py-1 rounded shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                              ⚡ ÚLTIMAS {inv.available} UDS
                            </span>
                          ) : (
                            <span className="bg-emerald-500/20 backdrop-blur-md text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded">
                              ● {inv.available} LIBRES
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div>
                          <h2 className="font-display font-bold text-white text-lg leading-snug group-hover:text-amber-300 transition-colors">
                            {product.name}
                          </h2>
                          <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                            {product.description}
                          </p>

                          {/* Variant Selector */}
                          <div className="mt-4">
                            <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-2">
                              SELECCIONAR SKU ({product.variants.length})
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
                                        ? "border-amber-500/70 bg-amber-500/10 text-white"
                                        : "border-white/10 bg-[#0B0E15]/60 hover:border-white/25 text-slate-300"
                                    }`}
                                  >
                                    <div className="truncate pr-2">
                                      <span className="block truncate font-medium">
                                        {v.name}
                                      </span>
                                      <span className="font-mono text-[10px] text-amber-400/90">
                                        {v.sku}
                                      </span>
                                    </div>
                                    <div className="text-right shrink-0 font-mono">
                                      <span className="block font-bold text-white">
                                        {formatCurrency(v.priceCents)}
                                      </span>
                                      <span
                                        className={`text-[10px] ${
                                          v.inventory.available === 0
                                            ? "text-rose-400 font-bold"
                                            : "text-emerald-400"
                                        }`}
                                      >
                                        AV:{v.inventory.available} / RS:
                                        {v.inventory.reserved}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Real-time Stock Telemetry & Add to Cart */}
                        <div className="pt-3 border-t border-white/10 space-y-3">
                          {/* Visual Stock Progress Bar */}
                          <div className="space-y-1.5">
                            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden flex">
                              <div
                                className="bg-emerald-400 transition-all duration-500"
                                style={{ width: `${availPercent}%` }}
                              />
                              <div
                                className="bg-amber-400 transition-all duration-500"
                                style={{ width: `${100 - availPercent}%` }}
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-center bg-[#0B0E15] rounded-lg p-2 border border-white/10 text-[10px] font-mono">
                              <div>
                                <span className="text-slate-500 block">
                                  ON_HAND
                                </span>
                                <span className="font-bold text-white text-xs">
                                  {inv.onHand}
                                </span>
                              </div>
                              <div className="border-x border-white/10">
                                <span className="text-slate-500 block">
                                  AVAILABLE
                                </span>
                                <span className="font-bold text-emerald-400 text-xs">
                                  {inv.available}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">
                                  RESERVED
                                </span>
                                <span className="font-bold text-amber-400 text-xs">
                                  {inv.reserved}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1">
                            <div>
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                                PRECIO UNITARIO
                              </span>
                              <span className="font-mono text-xl font-extrabold text-white">
                                {formatCurrency(activeVariant.priceCents)}
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => addToCart(product, activeVariant)}
                              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-white/5 disabled:text-slate-600 disabled:border disabled:border-white/10 text-[#090B10] font-mono font-bold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.2)] transition-all cursor-pointer disabled:cursor-not-allowed disabled:shadow-none"
                            >
                              <ShoppingCart className="w-4 h-4 stroke-[2.2]" />
                              {isOutOfStock ? "AGOTADO" : "AGREGAR SKU"}
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

          {/* Right Sticky Sidebar: Shopping Cart & ACID Checkout */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-5">
            <div className="bg-[#11151F] rounded-2xl border border-white/10 shadow-2xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-5 h-5 text-amber-400" />
                  <h2 className="font-display font-bold text-white text-base tracking-wide">
                    BUFFER DE RESERVA
                  </h2>
                </div>
                <span className="text-xs font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded">
                  {cart.reduce((s, c) => s + c.quantity, 0)} UDS
                </span>
              </div>

              {cart.length === 0 ? (
                <div className="py-12 text-center space-y-2.5">
                  <Package className="w-10 h-10 text-slate-600 mx-auto stroke-[1.5]" />
                  <p className="text-sm font-display font-bold text-slate-300">
                    CARRITO SIN SKUs SELECCIONADOS
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    El stock libre no se retiene al agregar al carrito. El
                    bloqueo{" "}
                    <code className="font-mono text-amber-400">
                      SELECT ... FOR UPDATE
                    </code>{" "}
                    se ejecuta al iniciar el Checkout.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="divide-y divide-white/10 max-h-80 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div key={item.variant.id} className="py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-white">
                              {item.productName}
                            </h4>
                            <p className="text-[11px] text-slate-400">
                              {item.variant.name}
                            </p>
                            <span className="inline-block text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded mt-1">
                              {item.variant.sku}
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-white">
                            {formatCurrency(
                              item.variant.priceCents * item.quantity
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-emerald-400">
                            MAX_AVAIL: {item.variant.inventory.available}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateCartQty(item.variant.id, -1)
                              }
                              className="w-6 h-6 rounded border border-white/15 bg-white/5 flex items-center justify-center hover:bg-white/15 text-white cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-mono font-bold text-white">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(item.variant.id, 1)}
                              className="w-6 h-6 rounded border border-white/15 bg-white/5 flex items-center justify-center hover:bg-white/15 text-white cursor-pointer"
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
                              className="ml-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300">
                      <span>TOTAL A BLOQUEAR:</span>
                      <span className="text-lg text-amber-400">
                        {formatCurrency(cartTotalCents)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={checkoutLoading}
                      onClick={handleStartCheckout}
                      className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#090B10] font-mono font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(245,158,11,0.3)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Lock className="w-4 h-4 stroke-[2.2]" />
                      {checkoutLoading
                        ? "LOCKING ROWS (FOR UPDATE)..."
                        : "EJECUTAR CHECKOUT (TTL 15M)"}
                    </button>

                    <div className="p-3 rounded-lg bg-[#090B10] border border-white/10 text-[11px] font-mono text-slate-400 leading-relaxed">
                      <span className="text-emerald-400 font-bold block mb-0.5">
                        ✓ GARANTÍA ANTI-OVERSELLING:
                      </span>
                      Ordena los SKUs alfabéticamente, reclama reservas vencidas
                      (Lazy Release) y retiene el stock en PostgreSQL.
                    </div>
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
