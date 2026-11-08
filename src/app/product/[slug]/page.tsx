"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Minus } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { formatCurrency } from "@/components/StatusBadge";
import { useCart } from "@/components/CartContext";
import type {
  ProductDTO,
  ProductVariantDTO,
  SessionUser,
} from "@/lib/types/domain";

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [user, setUser] = useState<SessionUser | null>(null);
  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const { addItem, setIsCartOpen } = useCart();

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, catRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/catalog"),
      ]);
      const meData = await meRes.json();
      const catData = await catRes.json();

      setUser(meData.user ?? null);
      const products: ProductDTO[] = catData.products ?? [];
      const found = products.find((p) => p.slug === slug) ?? null;
      setProduct(found);

      if (found && found.variants.length > 0) {
        setSelectedVariantId((prev) => {
          if (prev && found.variants.some((v) => v.id === prev)) return prev;
          // Prefer selecting an in-stock variant first if available
          const firstAvailable = found.variants.find(
            (v) => v.inventory.available > 0
          );
          return (firstAvailable ?? found.variants[0])!.id;
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const activeVariant: ProductVariantDTO | null =
    product?.variants.find((v) => v.id === selectedVariantId) ??
    product?.variants[0] ??
    null;

  // Reset quantity when switching variants
  useEffect(() => {
    setQuantity(1);
    setFeedback(null);
  }, [selectedVariantId]);

  const handleAddToBag = () => {
    if (!product || !activeVariant) return;
    const res = addItem(
      {
        id: product.id,
        slug: product.slug,
        name: product.name,
        imageUrl: product.imageUrl,
      },
      activeVariant,
      quantity
    );

    if (!res.ok) {
      setFeedback({
        type: "error",
        text: res.message || "No se pudo agregar a la bolsa.",
      });
      return;
    }

    setFeedback({
      type: "success",
      text: `Se agregaron ${quantity} ${
        quantity === 1 ? "unidad" : "unidades"
      } de ${activeVariant.name} a tu bolsa.`,
    });
    setIsCartOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F5]">
      <Navbar
        user={user}
        onUserChange={setUser}
        onDataRefresh={loadProduct}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Back link */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-[#52555A] hover:text-[#141517] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al catálogo
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-6 aspect-[4/3] bg-[#EBEAE4] rounded animate-pulse" />
            <div className="lg:col-span-6 space-y-4">
              <div className="h-8 w-3/4 bg-[#EBEAE4] rounded animate-pulse" />
              <div className="h-20 w-full bg-[#EBEAE4] rounded animate-pulse" />
            </div>
          </div>
        ) : !product || !activeVariant ? (
          <div className="bg-white rounded border border-[#DDDCDA] p-10 space-y-3">
            <h1 className="text-lg font-bold text-[#141517]">
              Producto no encontrado
            </h1>
            <p className="text-xs text-[#52555A]">
              El artículo que buscas no existe en el catálogo actual.
            </p>
            <Link
              href="/"
              className="inline-block px-4 py-2 rounded bg-[#141517] text-white text-xs font-medium"
            >
              Regresar al catálogo
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            {/* Left Column: Product Photograph & Out-of-Stock Callout */}
            <div className="lg:col-span-6 space-y-4">
              <div
                className={`relative aspect-[4/3] w-full rounded overflow-hidden border bg-[#EBEAE4] ${
                  activeVariant.inventory.available <= 0
                    ? "border-rose-400"
                    : "border-[#DDDCDA]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className={`w-full h-full object-cover transition-opacity ${
                    activeVariant.inventory.available <= 0
                      ? "grayscale opacity-45"
                      : ""
                  }`}
                />

                {activeVariant.inventory.available <= 0 && (
                  <div className="absolute inset-0 bg-rose-950/35 flex flex-col items-center justify-center p-6 text-center">
                    <span className="bg-[#BE123C] text-white text-sm font-semibold px-4 py-2 rounded shadow-sm">
                      Configuración agotada — 0 unidades disponibles
                    </span>
                    {activeVariant.inventory.reserved > 0 && (
                      <span className="mt-2.5 bg-white text-[#141517] text-xs font-medium px-3 py-1 rounded">
                        {activeVariant.inventory.reserved}{" "}
                        {activeVariant.inventory.reserved === 1
                          ? "unidad apartada en reserva activa de 15 min"
                          : "unidades apartadas en reservas activas de 15 min"}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Specification Attributes Box */}
              <div className="bg-white rounded border border-[#DDDCDA] p-5 space-y-3">
                <h3 className="text-xs font-semibold text-[#141517]">
                  Especificaciones de la configuración seleccionada
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-[#52555A]">Código SKU</dt>
                    <dd className="font-mono font-semibold text-[#141517] mt-0.5">
                      {activeVariant.sku}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52555A]">Categoría</dt>
                    <dd className="font-medium text-[#141517] mt-0.5">
                      {product.category}
                    </dd>
                  </div>
                  {Object.entries(activeVariant.attributes).map(([k, val]) => (
                    <div key={k}>
                      <dt className="text-[#52555A] capitalize">{k}</dt>
                      <dd className="font-medium text-[#141517] mt-0.5">
                        {val}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Right Column: Configuration, Live Stock & Add to Bag */}
            <div className="lg:col-span-6 space-y-6">
              <div className="border-b border-[#DDDCDA] pb-5">
                <span className="text-xs font-medium text-[#52555A]">
                  {product.category}
                </span>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#141517] tracking-tight mt-1">
                  {product.name}
                </h1>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-bold text-[#141517]">
                    {formatCurrency(activeVariant.priceCents)}
                  </span>
                  {activeVariant.inventory.available <= 0 ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-[#BE123C] text-white">
                      Sin unidades disponibles
                    </span>
                  ) : activeVariant.inventory.available <= 3 ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-950 border border-amber-300">
                      Quedan solo {activeVariant.inventory.available}{" "}
                      {activeVariant.inventory.available === 1
                        ? "unidad"
                        : "unidades"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200">
                      Disponible para reserva inmediata
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#52555A] mt-4 leading-relaxed max-w-[60ch]">
                  {product.description}
                </p>
              </div>

              {/* Variant Selector */}
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-[#141517]">
                  Elige una configuración ({product.variants.length})
                </label>

                <div className="space-y-2">
                  {product.variants.map((v) => {
                    const isSelected = v.id === activeVariant.id;
                    const isSoldOut = v.inventory.available <= 0;

                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariantId(v.id)}
                        className={`w-full text-left p-3.5 rounded border transition-colors flex items-center justify-between gap-4 cursor-pointer ${
                          isSoldOut
                            ? isSelected
                              ? "border-[#BE123C] bg-rose-50"
                              : "border-rose-200 bg-rose-50/40 hover:border-rose-300"
                            : isSelected
                            ? "border-[#1D4ED8] bg-white ring-1 ring-[#1D4ED8]"
                            : "border-[#DDDCDA] bg-white hover:bg-[#EBEAE4]/40"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                isSoldOut
                                  ? "text-rose-950 line-through decoration-rose-600/60"
                                  : "text-[#141517]"
                              }`}
                            >
                              {v.name}
                            </span>
                            {isSoldOut && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#BE123C] text-white">
                                Agotado
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-xs text-[#52555A] block mt-0.5">
                            Código: {v.sku}
                          </span>
                        </div>

                        <div className="text-right font-mono shrink-0">
                          <span className="text-sm font-bold text-[#141517] block">
                            {formatCurrency(v.priceCents)}
                          </span>
                          <span
                            className={`text-xs ${
                              isSoldOut
                                ? "text-[#BE123C] font-semibold"
                                : "text-emerald-800"
                            }`}
                          >
                            {isSoldOut
                              ? "0 disponibles"
                              : `${v.inventory.available} disponibles`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Real-time Warehouse Stock Breakdown */}
              <div className="bg-white rounded border border-[#DDDCDA] p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-[#141517]">
                    Estado del inventario en almacén
                  </span>
                  <button
                    type="button"
                    onClick={loadProduct}
                    className="text-xs text-[#1D4ED8] hover:underline cursor-pointer"
                  >
                    Actualizar ahora
                  </button>
                </div>

                <dl className="grid grid-cols-3 gap-3 text-center bg-[#F7F7F5] p-3 rounded border border-[#DDDCDA] text-xs">
                  <div>
                    <dt className="text-[#52555A]">Físico en almacén</dt>
                    <dd className="font-mono text-base font-bold text-[#141517] mt-0.5">
                      {activeVariant.inventory.onHand}
                    </dd>
                  </div>
                  <div className="border-x border-[#DDDCDA]">
                    <dt className="text-[#52555A]">Disponibles</dt>
                    <dd
                      className={`font-mono text-base font-bold mt-0.5 ${
                        activeVariant.inventory.available <= 0
                          ? "text-[#BE123C]"
                          : "text-emerald-800"
                      }`}
                    >
                      {activeVariant.inventory.available}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52555A]">En reserva (15 min)</dt>
                    <dd className="font-mono text-base font-bold text-amber-800 mt-0.5">
                      {activeVariant.inventory.reserved}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Strong Out-of-Stock Notice vs Add to Bag Controls */}
              {activeVariant.inventory.available <= 0 ? (
                <div className="p-5 rounded border-2 border-[#BE123C] bg-rose-50 text-rose-950 space-y-2">
                  <div className="text-sm font-bold text-[#BE123C]">
                    Este modelo no tiene unidades disponibles para compra
                  </div>
                  {activeVariant.inventory.reserved > 0 ? (
                    <p className="text-xs leading-relaxed">
                      Actualmente hay{" "}
                      <strong className="font-mono">
                        {activeVariant.inventory.reserved}
                      </strong>{" "}
                      {activeVariant.inventory.reserved === 1
                        ? "unidad apartada"
                        : "unidades apartadas"}{" "}
                      por otros compradores en proceso de pago. Si no confirman
                      su compra dentro de los 15 minutos de reserva, las
                      unidades volverán a estar disponibles automáticamente.
                    </p>
                  ) : (
                    <p className="text-xs leading-relaxed">
                      Todas las unidades físicas de este modelo han sido
                      vendidas. Selecciona otra configuración disponible o
                      espera una nueva entrada de mercancía en almacén.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4 pt-1">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center border border-[#DDDCDA] rounded bg-white">
                      <button
                        type="button"
                        onClick={() =>
                          setQuantity((q) => Math.max(1, q - 1))
                        }
                        className="w-10 h-10 flex items-center justify-center text-[#141517] hover:bg-[#EBEAE4] cursor-pointer"
                        aria-label="Disminuir cantidad"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-12 text-center font-mono text-sm font-semibold text-[#141517]">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setQuantity((q) =>
                            Math.min(activeVariant.inventory.available, q + 1)
                          )
                        }
                        className="w-10 h-10 flex items-center justify-center text-[#141517] hover:bg-[#EBEAE4] cursor-pointer"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddToBag}
                      className="flex-1 py-3 px-6 rounded bg-[#141517] hover:bg-[#2A2C30] text-white text-sm font-medium transition-colors cursor-pointer"
                    >
                      Agregar a la bolsa —{" "}
                      <span className="font-mono">
                        {formatCurrency(activeVariant.priceCents * quantity)}
                      </span>
                    </button>
                  </div>

                  <p className="text-xs text-[#52555A]">
                    Tu selección queda guardada en la bolsa durante toda tu
                    sesión. El bloqueo definitivo por 15 minutos se activa al
                    iniciar el pago.
                  </p>
                </div>
              )}

              {feedback && (
                <div
                  className={`p-3.5 rounded border text-xs ${
                    feedback.type === "success"
                      ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                      : "bg-rose-50 border-rose-300 text-rose-950"
                  }`}
                >
                  {feedback.text}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
