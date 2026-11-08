import type { Metadata } from "next";
import { CartProvider } from "@/components/CartContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockGuard — Equipamiento de estudio e inventario transaccional",
  description:
    "Comercio electrónico con reservas de inventario de 15 minutos, bloqueo transaccional en PostgreSQL, Kardex contable y gestión de estados de pedidos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#F7F7F5] text-[#141517] antialiased selection:bg-[#1D4ED8] selection:text-white">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
