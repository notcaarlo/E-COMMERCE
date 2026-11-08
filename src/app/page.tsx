"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { formatCurrency } from "@/components/StatusBadge";
import { useCart } from "@/components/CartContext";
import type { ProductDTO, SessionUser } from "@/lib/types/domain";

export default function ShopCatalogPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [loading, setLoading] = useState(true);
  const { activeOrder, setIsCartOpen } = useCart();

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, catRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/catalog"),
      ]);
      const meData = await meRes.json();
      const catData = await catRes.json();
      setUser(meData.user ?? null);
      setProducts(catData.products ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return [
      { name: "Todos", count: products.length },
      ...Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === "Todos") return products;
    return products.filter((p) => p.category === selectedCategory);
  }, [products, selectedCategory]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F5]">
      <Navbar
        user={user}
        onUserChange={setUser}
        onDataRefresh={loadCatalog}
      />

      {/* Subtle notice bar if the user has an active 15-minute checkout reservation */}
      {activeOrder && activeOrder.status === "PENDING_PAYMENT" && (
        <div className="bg-[#1D4ED8] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4 text-xs">
            <span>
              Tienes una reserva activa para el pedido{" "}
              <strong className="font-mono">{activeOrder.orderNumber}</strong>.
              Tus unidades están apartadas en almacén esperando confirmación de
              pago.
            </span>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="font-medium underline underline-offset-2 shrink-0 cursor-pointer"
            >
              Abrir pago en la bolsa
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Editorial Header */}
        <header className="max-w-2xl mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#141517] tracking-tight leading-tight">
            Equipamiento de estudio y periféricos de precisión
          </h1>
          <p className="text-sm text-[#52555A] mt-2.5 leading-relaxed">
            Selecciona cualquier equipo para consultar sus configuraciones,
            revisar las unidades disponibles en almacén en tiempo real y
            reservar tu pedido.
          </p>
        </header>

        {/* Minimalist Category Tab Line (no button clutter) */}
        <div className="border-b border-[#DDDCDA] mb-10 flex items-center justify-between gap-6 overflow-x-auto">
          <nav className="flex items-center gap-7" aria-label="Categorías">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`pb-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "border-[#141517] text-[#141517]"
                      : "border-transparent text-[#52555A] hover:text-[#141517]"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="ml-1.5 font-mono text-xs text-[#52555A]">
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Clean Product Gallery */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="space-y-3">
                <div className="aspect-[4/3] w-full bg-[#EBEAE4] rounded animate-pulse" />
                <div className="h-5 w-2/3 bg-[#EBEAE4] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {filteredProducts.map((product) => {
              const totalAvailable = product.variants.reduce(
                (sum, v) => sum + v.inventory.available,
                0
              );
              const totalReserved = product.variants.reduce(
                (sum, v) => sum + v.inventory.reserved,
                0
              );
              const hasExhaustedVariant = product.variants.some(
                (v) => v.inventory.available === 0
              );
              const isCompletelyOutOfStock = totalAvailable <= 0;
              const isCriticalStock =
                totalAvailable > 0 && totalAvailable <= 3;
              const minPriceCents = Math.min(
                ...product.variants.map((v) => v.priceCents)
              );

              return (
                <Link
                  key={product.id}
                  href={`/product/${product.slug}`}
                  className="group block focus:outline-none"
                >
                  {/* Image Canvas */}
                  <div
                    className={`relative aspect-[4/3] w-full overflow-hidden rounded bg-[#EBEAE4] border transition-colors ${
                      isCompletelyOutOfStock
                        ? "border-rose-300 bg-rose-50/40"
                        : "border-[#DDDCDA] group-hover:border-[#141517]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className={`w-full h-full object-cover transition-transform duration-500 ${
                        isCompletelyOutOfStock
                          ? "grayscale opacity-40"
                          : "group-hover:scale-[1.03]"
                      }`}
                    />

                    {/* High-contrast Out of Stock overlay when 0 units are available */}
                    {isCompletelyOutOfStock && (
                      <div className="absolute inset-0 bg-rose-950/35 flex flex-col items-center justify-center p-4 text-center">
                        <span className="bg-[#BE123C] text-white text-xs font-semibold px-3.5 py-1.5 rounded shadow-sm">
                          Agotado — Sin unidades disponibles
                        </span>
                        {totalReserved > 0 && (
                          <span className="mt-2 bg-white/95 text-[#141517] text-[11px] font-medium px-2.5 py-1 rounded">
                            {totalReserved}{" "}
                            {totalReserved === 1
                              ? "unidad apartada en reserva"
                              : "unidades apartadas en reserva"}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Prominent warning bar when a variant is sold out or stock is critical */}
                    {!isCompletelyOutOfStock &&
                      (hasExhaustedVariant || isCriticalStock) && (
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                          {hasExhaustedVariant ? (
                            <span className="bg-[#BE123C] text-white text-[11px] font-semibold px-2.5 py-1 rounded shadow-xs">
                              1 configuración agotada
                            </span>
                          ) : (
                            <span className="bg-amber-500 text-[#141517] text-[11px] font-semibold px-2.5 py-1 rounded shadow-xs">
                              {totalAvailable === 1
                                ? "Última unidad disponible"
                                : `Últimas ${totalAvailable} unidades`}
                            </span>
                          )}
                        </div>
                      )}
                  </div>

                  {/* Minimalist Caption: Only Product Name & Price/Availability */}
                  <div className="mt-3.5 flex items-baseline justify-between gap-4">
                    <h2
                      className={`text-base font-semibold leading-snug transition-colors ${
                        isCompletelyOutOfStock
                          ? "text-[#52555A] line-through decoration-rose-600/60"
                          : "text-[#141517] group-hover:text-[#1D4ED8]"
                      }`}
                    >
                      {product.name}
                    </h2>

                    <span
                      className={`font-mono text-sm shrink-0 ${
                        isCompletelyOutOfStock
                          ? "text-[#BE123C] font-semibold"
                          : "text-[#141517] font-medium"
                      }`}
                    >
                      {isCompletelyOutOfStock
                        ? "Agotado"
                        : formatCurrency(minPriceCents)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
