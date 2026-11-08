"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import type { SessionUser } from "@/lib/types/domain";
import { RoleBadge } from "./StatusBadge";
import { useCart } from "./CartContext";
import { CartDrawer } from "./CartDrawer";

interface NavbarProps {
  user: SessionUser | null;
  onUserChange?: (user: SessionUser | null) => void;
  onDataRefresh?: () => void;
}

export function Navbar({ user, onUserChange, onDataRefresh }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { totalItems, activeOrder, setIsCartOpen } = useCart();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onUserChange?.(null);
    router.push("/login");
    router.refresh();
  };

  const isStaff =
    user &&
    (user.role === "WAREHOUSE_OPERATOR" ||
      user.role === "SUPPORT" ||
      user.role === "ADMIN");

  const hasPendingPayment =
    activeOrder && activeOrder.status === "PENDING_PAYMENT";

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#F7F7F5]/95 backdrop-blur border-b border-[#DDDCDA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="font-bold text-[#141517] tracking-tight text-lg">
                StockGuard
              </span>
              <span className="text-xs text-[#52555A] hidden sm:inline">
                Equipamiento de estudio
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/"
                className={`text-sm font-medium transition-colors py-1 border-b-2 ${
                  pathname === "/" || pathname.startsWith("/product")
                    ? "border-[#141517] text-[#141517]"
                    : "border-transparent text-[#52555A] hover:text-[#141517]"
                }`}
              >
                Catálogo
              </Link>

              <Link
                href="/orders"
                className={`text-sm font-medium transition-colors py-1 border-b-2 ${
                  pathname.startsWith("/orders")
                    ? "border-[#141517] text-[#141517]"
                    : "border-transparent text-[#52555A] hover:text-[#141517]"
                }`}
              >
                Mis pedidos
              </Link>

              {isStaff && (
                <Link
                  href="/admin"
                  className={`text-sm font-medium transition-colors py-1 border-b-2 ${
                    pathname.startsWith("/admin")
                      ? "border-[#1D4ED8] text-[#1D4ED8]"
                      : "border-transparent text-[#1D4ED8] hover:text-blue-900"
                  }`}
                >
                  Panel de operaciones
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Persistent Session Cart / Active Reservation Trigger */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                hasPendingPayment
                  ? "bg-amber-50 border-amber-400 text-amber-950"
                  : totalItems > 0
                  ? "bg-[#141517] border-[#141517] text-white"
                  : "bg-white border-[#DDDCDA] text-[#141517] hover:bg-[#EBEAE4]"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Bolsa</span>
              <span className="font-mono font-semibold">({totalItems})</span>
              {hasPendingPayment && (
                <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-2.5">
                <div className="hidden lg:flex items-center gap-2 text-xs">
                  <span className="font-medium text-[#141517]">
                    {user.name}
                  </span>
                  <RoleBadge role={user.role} />
                </div>
                <Link
                  href="/login"
                  className="text-xs font-medium text-[#52555A] hover:text-[#141517] px-2.5 py-1.5 rounded border border-[#DDDCDA] bg-white transition-colors"
                >
                  Cuenta
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-2 py-1.5 rounded text-xs font-medium text-[#52555A] hover:text-[#141517] transition-colors cursor-pointer"
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded text-xs font-medium bg-white border border-[#DDDCDA] text-[#141517] hover:bg-[#EBEAE4] transition-colors"
              >
                Iniciar sesión
              </Link>
            )}
          </div>
        </div>

        {/* Mobile navigation */}
        <div className="flex md:hidden border-t border-[#DDDCDA] px-4 py-2 gap-4 overflow-x-auto bg-white text-xs">
          <Link
            href="/"
            className={`font-medium ${
              pathname === "/" || pathname.startsWith("/product")
                ? "text-[#141517] underline underline-offset-4"
                : "text-[#52555A]"
            }`}
          >
            Catálogo
          </Link>
          <Link
            href="/orders"
            className={`font-medium ${
              pathname.startsWith("/orders")
                ? "text-[#141517] underline underline-offset-4"
                : "text-[#52555A]"
            }`}
          >
            Mis pedidos
          </Link>
          {isStaff && (
            <Link
              href="/admin"
              className="font-medium text-[#1D4ED8]"
            >
              Operaciones
            </Link>
          )}
          <Link href="/login" className="font-medium text-[#52555A] ml-auto">
            Cuentas
          </Link>
        </div>
      </header>

      <CartDrawer user={user} onCheckoutSuccess={onDataRefresh} />
    </>
  );
}
