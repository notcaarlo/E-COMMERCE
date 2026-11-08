"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  AlertCircle,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { ROLE_CONFIG, RoleBadge } from "@/components/StatusBadge";
import type { Role, SessionUser } from "@/lib/types/domain";

const DEMO_ACCOUNTS: {
  email: string;
  password: string;
  name: string;
  role: Role;
  redirectTo: string;
  permissions: string[];
}[] = [
  {
    email: "cliente@demo.com",
    password: "demo123",
    name: "Carlos Méndez",
    role: "CUSTOMER",
    redirectTo: "/",
    permissions: [
      "Explorar catálogo con stock en tiempo real",
      "Crear checkout con reserva temporal (TTL 15m)",
      "Cancelar pedido únicamente en PENDING_PAYMENT o PAID (bloqueado en PROCESSING)",
      "Solicitar devolución una vez DELIVERED",
    ],
  },
  {
    email: "almacen@demo.com",
    password: "demo123",
    name: "Elena Torres",
    role: "WAREHOUSE_OPERATOR",
    redirectTo: "/admin",
    permissions: [
      "Iniciar Picking/Packing (PAID -> PROCESSING) y Despacho (PROCESSING -> SHIPPED)",
      "Inspeccionar devoluciones físicas eligiendo entre Stock Disponible vs Stock Dañado",
      "Registrar entradas (RESTOCK) y ajustes manuales con motivo obligatorio en Kardex",
    ],
  },
  {
    email: "soporte@demo.com",
    password: "demo123",
    name: "Sofía Ramírez",
    role: "SUPPORT",
    redirectTo: "/admin",
    permissions: [
      "Resolver alertas de pagos tardíos post-TTL y procesar reembolsos (REFUND_PENDING -> REFUNDED)",
      "Ejecutar cancelaciones asistidas para pedidos ya en PROCESSING",
      "Sin permiso para modificar saldos físicos de inventario (separación de funciones)",
    ],
  },
  {
    email: "admin@demo.com",
    password: "demo123",
    name: "Alejandro Vega",
    role: "ADMIN",
    redirectTo: "/admin",
    permissions: [
      "Acceso total al Dashboard Backoffice, Máquina de Estados y Kardex",
      "Permisos de Almacén + Soporte + Ejecución manual del Worker de Expiración y Reset de Demo",
    ],
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState("cliente@demo.com");
  const [password, setPassword] = useState("demo123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setCurrentUser(d.user ?? null))
      .catch(() => {});
  }, []);

  const handleLogin = async (
    e: React.FormEvent,
    customEmail?: string,
    customPassword?: string,
    customRedirect?: string
  ) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const targetEmail = customEmail ?? email;
      const targetPassword = customPassword ?? password;
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password: targetPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al iniciar sesión");
        setLoading(false);
        return;
      }
      setCurrentUser(data.user);
      const dest =
        customRedirect ??
        (data.user.role === "CUSTOMER" ? "/" : "/admin");
      router.push(dest);
      router.refresh();
    } catch {
      setError("Error de red al intentar iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar user={currentUser} onUserChange={setCurrentUser} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left column: Traditional Login Form */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Iniciar Sesión
                </h1>
                <p className="text-xs text-slate-500">
                  Autenticación con control de acceso basado en roles (RBAC)
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={(e) => handleLogin(e)} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="usuario@demo.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Verificando credenciales..." : "Entrar al Sistema"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 space-y-1.5">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                Seguridad de Sesión
              </div>
              <p>
                Las sesiones se firman con HMAC-SHA256 en cookies{" "}
                <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">
                  HttpOnly
                </code>{" "}
                y cada endpoint valida permisos estrictos por rol.
              </p>
            </div>
          </div>

          {/* Right column: Role Credentials Matrix for Portfolio Evaluators */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h2 className="text-base font-bold text-slate-900">
                Cuentas de Demostración por Rol (RBAC)
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Selecciona cualquiera de los 4 roles del sistema para rellenar
                las credenciales o iniciar sesión directamente y probar la
                separación de responsabilidades entre Tienda y Backoffice:
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3.5">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isCurrent = currentUser?.email === acc.email;
                  return (
                    <div
                      key={acc.email}
                      className={`p-4 rounded-xl border transition-all ${
                        email === acc.email
                          ? "border-indigo-500 bg-indigo-50/30"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <RoleBadge role={acc.role} />
                          <span className="font-semibold text-sm text-slate-900">
                            {acc.name}
                          </span>
                          {isCurrent && (
                            <span className="text-[11px] font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                              Sesión Activa
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEmail(acc.email);
                              setPassword(acc.password);
                            }}
                            className="text-xs px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium cursor-pointer"
                          >
                            Rellenar
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={(e) =>
                              handleLogin(
                                e,
                                acc.email,
                                acc.password,
                                acc.redirectTo
                              )
                            }
                            className="text-xs px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            Entrar como {ROLE_CONFIG[acc.role].label}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-4 text-xs font-mono text-slate-500">
                        <span>Email: {acc.email}</span>
                        <span>Pass: {acc.password}</span>
                        <span>Vista destino: {acc.redirectTo}</span>
                      </div>

                      <ul className="mt-3 space-y-1">
                        {acc.permissions.map((perm, i) => (
                          <li
                            key={i}
                            className="text-xs text-slate-600 flex items-start gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{perm}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
