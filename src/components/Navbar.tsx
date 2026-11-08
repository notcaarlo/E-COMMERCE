"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShoppingBag,
  PackageCheck,
  LayoutDashboard,
  LogIn,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import type { SessionUser } from "@/lib/types/domain";
import { RoleBadge } from "./StatusBadge";

interface NavbarProps {
  user: SessionUser | null;
  onUserChange?: (user: SessionUser | null) => void;
}

export function Navbar({ user, onUserChange }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

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

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-sm group-hover:bg-indigo-600 transition-colors">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight text-base block leading-none">
                StockGuard<span className="text-indigo-600">.io</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                ACID Inventory &amp; Order Engine
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Tienda (Catálogo)
            </Link>

            <Link
              href="/orders"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith("/orders")
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <PackageCheck className="w-4 h-4" />
              Mis Pedidos
            </Link>

            {isStaff && (
              <Link
                href="/admin"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-indigo-600 text-white"
                    : "text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard Backoffice
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    {user.name}
                  </span>
                  <RoleBadge role={user.role} />
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  {user.email}
                </span>
              </div>
              <Link
                href="/login"
                className="text-xs font-medium text-slate-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-md border border-slate-200 hover:border-indigo-200 bg-slate-50 transition-colors"
                title="Cambiar de cuenta o rol"
              >
                Cambiar Rol
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Iniciar Sesión / Roles
            </Link>
          )}
        </div>
      </div>

      {/* Mobile bottom sub-bar */}
      <div className="flex md:hidden border-t border-slate-100 px-4 py-2 gap-2 overflow-x-auto bg-slate-50">
        <Link
          href="/"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
            pathname === "/"
              ? "bg-slate-900 text-white"
              : "text-slate-700 bg-white border border-slate-200"
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Tienda
        </Link>
        <Link
          href="/orders"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
            pathname.startsWith("/orders")
              ? "bg-slate-900 text-white"
              : "text-slate-700 bg-white border border-slate-200"
          }`}
        >
          <PackageCheck className="w-3.5 h-3.5" />
          Mis Pedidos
        </Link>
        {isStaff && (
          <Link
            href="/admin"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium ${
              pathname.startsWith("/admin")
                ? "bg-indigo-600 text-white"
                : "text-indigo-700 bg-indigo-50 border border-indigo-200"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Backoffice
          </Link>
        )}
        <Link
          href="/login"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-slate-700 bg-white border border-slate-200 ml-auto"
        >
          <UserIcon className="w-3.5 h-3.5" />
          Roles
        </Link>
      </div>
    </header>
  );
}
