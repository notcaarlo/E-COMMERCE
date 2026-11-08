"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
      "Compra en el catálogo con reserva de unidades por 15 minutos",
      "Cancela un pedido por cuenta propia antes de que entre a preparación de almacén",
      "Solicita la devolución de un artículo después de recibirlo",
    ],
  },
  {
    email: "almacen@demo.com",
    password: "demo123",
    name: "Elena Torres",
    role: "WAREHOUSE_OPERATOR",
    redirectTo: "/admin",
    permissions: [
      "Prepara y despacha pedidos pagados descontando las unidades físicas del almacén",
      "Inspecciona devoluciones recibidas y decide qué unidades vuelven a la venta y cuáles pasan a cuarentena",
      "Registra entradas de mercancía y ajustes de conteo con motivo obligatorio en el registro contable",
    ],
  },
  {
    email: "soporte@demo.com",
    password: "demo123",
    name: "Sofía Ramírez",
    role: "SUPPORT",
    redirectTo: "/admin",
    permissions: [
      "Atiende avisos de pagos tardíos y ejecuta reembolsos pendientes",
      "Cancela pedidos que ya estaban en preparación a solicitud del cliente",
      "Consulta el inventario y el historial contable sin permiso para alterar el stock físico",
    ],
  },
  {
    email: "admin@demo.com",
    password: "demo123",
    name: "Alejandro Vega",
    role: "ADMIN",
    redirectTo: "/admin",
    permissions: [
      "Tiene acceso completo a las funciones de almacén, atención al cliente y auditoría",
      "Puede liberar reservas vencidas de forma manual o restaurar los datos iniciales de demostración",
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
        setError(data.error || "Verifica el correo y la contraseña.");
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
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={currentUser} onUserChange={setCurrentUser} />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left column: Sign in form */}
          <div className="lg:col-span-5 bg-white rounded border border-[#DDDCDA] p-6 sm:p-8">
            <h1 className="text-xl font-bold text-[#141517]">
              Iniciar sesión
            </h1>
            <p className="text-xs text-[#52555A] mt-1 leading-relaxed">
              Ingresa con tu cuenta o elige uno de los perfiles de prueba a la
              derecha para recorrer la tienda y el panel de operaciones.
            </p>

            {error && (
              <div className="mt-4 p-3 rounded bg-rose-50 border border-rose-300 text-rose-950 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={(e) => handleLogin(e)} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#141517] mb-1.5">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded bg-white border border-[#DDDCDA] text-[#141517] focus:outline-none focus:border-[#1D4ED8]"
                  placeholder="correo@ejemplo.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#141517] mb-1.5">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded bg-white border border-[#DDDCDA] text-[#141517] focus:outline-none focus:border-[#1D4ED8] font-mono"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded bg-[#141517] hover:bg-[#2A2C30] text-white font-medium text-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? "Iniciando sesión..." : "Entrar con esta cuenta"}
              </button>
            </form>
          </div>

          {/* Right column: Demo roles */}
          <div className="lg:col-span-7 bg-white rounded border border-[#DDDCDA] p-6">
            <h2 className="text-base font-bold text-[#141517]">
              Perfiles de demostración por rol
            </h2>
            <p className="text-xs text-[#52555A] mt-1">
              Cada perfil muestra únicamente las acciones que le corresponden
              dentro del flujo de compra, almacén y soporte:
            </p>

            <div className="mt-4 divide-y divide-[#DDDCDA] border border-[#DDDCDA] rounded">
              {DEMO_ACCOUNTS.map((acc) => {
                const isCurrent = currentUser?.email === acc.email;
                return (
                  <div
                    key={acc.email}
                    className={`p-4 transition-colors ${
                      email === acc.email ? "bg-blue-50/40" : "bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold text-sm text-[#141517]">
                          {acc.name}
                        </span>
                        <RoleBadge role={acc.role} />
                        {isCurrent && (
                          <span className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            Sesión actual
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
                          className="text-xs px-2.5 py-1 rounded border border-[#DDDCDA] text-[#52555A] hover:text-[#141517] hover:bg-[#EBEAE4] cursor-pointer"
                        >
                          Rellenar datos
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
                          className="text-xs font-medium px-3 py-1 rounded bg-[#1D4ED8] hover:bg-blue-800 text-white cursor-pointer"
                        >
                          Entrar como {ROLE_CONFIG[acc.role].label.toLowerCase()}
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs font-mono text-[#52555A]">
                      <span>{acc.email}</span>
                      <span>Contraseña: {acc.password}</span>
                    </div>

                    <ul className="mt-2.5 space-y-1 text-xs text-[#52555A] list-disc list-inside">
                      {acc.permissions.map((perm, i) => (
                        <li key={i}>{perm}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
