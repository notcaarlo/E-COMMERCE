"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Cpu,
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
    <header className="sticky top-0 z-40 bg-[#090B10]/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-amber-500 text-[#090B10] flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)] group-hover:bg-amber-400 transition-all">
              <Cpu className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <span className="font-display font-extrabold text-white tracking-tight text-base block leading-none">
                STOCK<span className="text-amber-400">GUARD</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                PG-ACID // LOCK ENGINE
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1.5">
            <Link
              href="/"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                pathname === "/"
                  ? "bg-amber-500 text-[#090B10] shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              CATÁLOGO HARDWARE
            </Link>

            <Link
              href="/orders"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                pathname.startsWith("/orders")
                  ? "bg-amber-500 text-[#090B10] shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                  : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5" />
              MIS PEDIDOS
            </Link>

            {isStaff && (
              <Link
                href="/admin"
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  pathname.startsWith("/admin")
                    ? "bg-emerald-500 text-[#090B10] shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                    : "text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20"
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                BACKOFFICE TERMINAL
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex flex-col items-end">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    {user.name}
                  </span>
                  <RoleBadge role={user.role} />
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {user.email}
                </span>
              </div>
              <Link
                href="/login"
                className="text-xs font-mono font-medium text-amber-300 hover:text-amber-200 px-2.5 py-1.5 rounded-md border border-amber-500/30 hover:border-amber-400/60 bg-amber-500/10 transition-colors"
                title="Cambiar de cuenta o rol"
              >
                CAMBIAR ROL
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">SALIR</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold tracking-wider uppercase bg-amber-500 text-[#090B10] hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all"
            >
              <LogIn className="w-3.5 h-3.5" />
              ACCESO / ROLES RBAC
            </Link>
          )}
        </div>
      </div>

      {/* Mobile bottom sub-bar */}
      <div className="flex md:hidden border-t border-white/10 px-4 py-2 gap-2 overflow-x-auto bg-[#0D1017]">
        <Link
          href="/"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-semibold ${
            pathname === "/"
              ? "bg-amber-500 text-[#090B10]"
              : "text-slate-300 bg-white/5 border border-white/10"
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Tienda
        </Link>
        <Link
          href="/orders"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-semibold ${
            pathname.startsWith("/orders")
              ? "bg-amber-500 text-[#090B10]"
              : "text-slate-300 bg-white/5 border border-white/10"
          }`}
        >
          <PackageCheck className="w-3.5 h-3.5" />
          Pedidos
        </Link>
        {isStaff && (
          <Link
            href="/admin"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-semibold ${
              pathname.startsWith("/admin")
                ? "bg-emerald-500 text-[#090B10]"
                : "text-emerald-300 bg-emerald-500/10 border border-emerald-500/30"
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Backoffice
          </Link>
        )}
        <Link
          href="/login"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 ml-auto"
        >
          <UserIcon className="w-3.5 h-3.5" />
          Roles
        </Link>
      </div>
    </header>
  );
}
