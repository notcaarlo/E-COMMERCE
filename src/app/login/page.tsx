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
  Terminal,
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
      "Explorar catálogo con telemetría de stock en tiempo real",
      "Crear checkout con bloqueo pesimista y reserva temporal (TTL 15m)",
      "Cancelar pedido únicamente en PENDING_PAYMENT o PAID (bloqueado en PROCESSING)",
      "Solicitar devolución RMA una vez DELIVERED",
    ],
  },
  {
    email: "almacen@demo.com",
    password: "demo123",
    name: "Elena Torres",
    role: "WAREHOUSE_OPERATOR",
    redirectTo: "/admin",
    permissions: [
      "Iniciar Picking/Packing (PAID → PROCESSING) y Despacho (PROCESSING → SHIPPED)",
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
      "Resolver alertas de pagos tardíos post-TTL y procesar reembolsos (REFUND_PENDING → REFUNDED)",
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
      "Acceso total al Backoffice Terminal, Máquina de Estados y Kardex",
      "Permisos de Almacén + Soporte + Ejecución manual del Worker de Expiración y Reset de Seed",
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
    <div className="min-h-screen flex flex-col">
      <Navbar user={currentUser} onUserChange={setCurrentUser} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left column: Traditional Login Form */}
          <div className="lg:col-span-5 bg-[#11151F] rounded-2xl border border-white/10 shadow-2xl p-6 sm:p-8 animate-fade-up">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-[#090B10] flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                <KeyRound className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h1 className="font-display text-xl font-extrabold text-white tracking-tight">
                  CONTROL DE ACCESO
                </h1>
                <p className="text-xs text-slate-400 font-mono">
                  RBAC // SEPARACIÓN DE FUNCIONES
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={(e) => handleLogin(e)} className="mt-6 space-y-4">
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  CORREO ELECTRÓNICO
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-[#090B10] border border-white/15 text-white focus:outline-none focus:border-amber-500 font-mono"
                    placeholder="usuario@demo.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  CONTRASEÑA
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-[#090B10] border border-white/15 text-white focus:outline-none focus:border-amber-500 font-mono"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#090B10] font-mono font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all disabled:opacity-50 cursor-pointer"
              >
                {loading ? "VERIFICANDO FIRMA HMAC..." : "AUTENTICAR SESIÓN"}
                <ArrowRight className="w-4 h-4 stroke-[2.2]" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-white/10 text-xs text-slate-400 space-y-1.5">
              <div className="font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                COOKIE FIRMADA HMAC-SHA256
              </div>
              <p className="leading-relaxed">
                Cada petición valida criptográficamente el rol del actor en el
                servidor antes de tocar saldos de inventario o estados de
                pedidos.
              </p>
            </div>
          </div>

          {/* Right column: Role Credentials Matrix */}
          <div className="lg:col-span-7 space-y-4 animate-fade-up">
            <div className="bg-[#11151F] rounded-2xl border border-white/10 p-6 shadow-2xl">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-amber-400" />
                <h2 className="font-display text-lg font-bold text-white">
                  MATRIZ DE ROLES DE DEMOSTRACIÓN (RBAC)
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Haz clic en cualquiera de los 4 perfiles operativos para iniciar
                sesión y evaluar la separación de permisos entre Tienda y
                Backoffice:
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3.5">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isCurrent = currentUser?.email === acc.email;
                  return (
                    <div
                      key={acc.email}
                      className={`p-4 rounded-xl border transition-all ${
                        email === acc.email
                          ? "border-amber-500/70 bg-amber-500/10"
                          : "border-white/10 hover:border-white/25 bg-[#0B0E15]/80"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <RoleBadge role={acc.role} />
                          <span className="font-bold text-sm text-white">
                            {acc.name}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded">
                              ● ACTIVO
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
                            className="text-xs font-mono px-2.5 py-1 rounded border border-white/15 text-slate-300 hover:bg-white/10 cursor-pointer"
                          >
                            RELLENAR
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
                            className="text-xs font-mono font-bold px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-[#090B10] flex items-center gap-1 cursor-pointer"
                          >
                            ENTRAR COMO {ROLE_CONFIG[acc.role].label}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-400">
                        <span>USER: {acc.email}</span>
                        <span>PASS: {acc.password}</span>
                        <span className="text-amber-300">
                          DEST: {acc.redirectTo}
                        </span>
                      </div>

                      <ul className="mt-3 space-y-1">
                        {acc.permissions.map((perm, i) => (
                          <li
                            key={i}
                            className="text-xs text-slate-300 flex items-start gap-2"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
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
