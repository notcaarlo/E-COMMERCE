import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockGuard E-Commerce — Control Estricto de Inventario y Pedidos (ACID)",
  description:
    "E-Commerce Full-Stack con reservas de stock con TTL, SELECT FOR UPDATE en PostgreSQL, Kardex inmutable (Inventory Ledger), máquina de estados de pedidos y RBAC.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
