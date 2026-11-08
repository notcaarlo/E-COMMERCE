"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { OrderDTO, ProductVariantDTO } from "@/lib/types/domain";

export interface CartItem {
  variantId: string;
  sku: string;
  variantName: string;
  productId: string;
  productSlug: string;
  productName: string;
  imageUrl: string;
  priceCents: number;
  maxAvailable: number;
  quantity: number;
}

interface CartContextValue {
  cart: CartItem[];
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  activeOrder: OrderDTO | null;
  setActiveOrder: (order: OrderDTO | null) => void;
  addItem: (
    product: { id: string; slug: string; name: string; imageUrl: string },
    variant: ProductVariantDTO,
    qty?: number
  ) => { ok: boolean; message?: string };
  updateQuantity: (variantId: string, delta: number) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalCents: number;
}

const CART_STORAGE_KEY = "stockguard_session_cart_v1";
const ACTIVE_ORDER_STORAGE_KEY = "stockguard_active_order_v1";

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOrder, setActiveOrderState] = useState<OrderDTO | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate cart and active reservation from sessionStorage/localStorage on mount
  useEffect(() => {
    try {
      const rawCart = sessionStorage.getItem(CART_STORAGE_KEY);
      if (rawCart) {
        const parsed = JSON.parse(rawCart);
        if (Array.isArray(parsed)) {
          setCart(parsed);
        }
      }
      const rawOrder = sessionStorage.getItem(ACTIVE_ORDER_STORAGE_KEY);
      if (rawOrder) {
        setActiveOrderState(JSON.parse(rawOrder));
      }
    } catch {
      // ignore storage errors
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist cart changes to sessionStorage
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, hydrated]);

  const setActiveOrder = useCallback((order: OrderDTO | null) => {
    setActiveOrderState(order);
    try {
      if (order) {
        sessionStorage.setItem(ACTIVE_ORDER_STORAGE_KEY, JSON.stringify(order));
      } else {
        sessionStorage.removeItem(ACTIVE_ORDER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  const addItem = useCallback(
    (
      product: { id: string; slug: string; name: string; imageUrl: string },
      variant: ProductVariantDTO,
      qty = 1
    ): { ok: boolean; message?: string } => {
      if (variant.inventory.available <= 0) {
        return {
          ok: false,
          message: "Este modelo no tiene unidades disponibles en este momento.",
        };
      }

      let exceeded = false;
      setCart((prev) => {
        const existing = prev.find((i) => i.variantId === variant.id);
        const currentQty = existing ? existing.quantity : 0;
        if (currentQty + qty > variant.inventory.available) {
          exceeded = true;
          return prev;
        }
        if (existing) {
          return prev.map((i) =>
            i.variantId === variant.id
              ? {
                  ...i,
                  quantity: i.quantity + qty,
                  maxAvailable: variant.inventory.available,
                  priceCents: variant.priceCents,
                }
              : i
          );
        }
        return [
          ...prev,
          {
            variantId: variant.id,
            sku: variant.sku,
            variantName: variant.name,
            productId: product.id,
            productSlug: product.slug,
            productName: product.name,
            imageUrl: product.imageUrl,
            priceCents: variant.priceCents,
            maxAvailable: variant.inventory.available,
            quantity: qty,
          },
        ];
      });

      if (exceeded) {
        return {
          ok: false,
          message: `Ya tienes el máximo de ${variant.inventory.available} unidades disponibles de ${variant.sku} en tu bolsa.`,
        };
      }

      return { ok: true };
    },
    []
  );

  const updateQuantity = useCallback((variantId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variantId !== variantId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty > item.maxAvailable) return item;
          return { ...item, quantity: nextQty };
        })
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setCart((prev) => prev.filter((item) => item.variantId !== variantId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const totalItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const totalCents = useMemo(
    () => cart.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [cart]
  );

  const value = useMemo(
    () => ({
      cart,
      isCartOpen,
      setIsCartOpen,
      activeOrder,
      setActiveOrder,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      totalItems,
      totalCents,
    }),
    [
      cart,
      isCartOpen,
      activeOrder,
      setActiveOrder,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      totalItems,
      totalCents,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
