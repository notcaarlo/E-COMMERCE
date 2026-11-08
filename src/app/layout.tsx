import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STOCKGUARD // Precision Hardware & ACID Inventory Engine",
  description:
    "E-Commerce Full-Stack con reservas de stock con TTL, SELECT FOR UPDATE en PostgreSQL, Kardex inmutable (Inventory Ledger), máquina de estados de pedidos y RBAC.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#090B10] text-[#F3F5F8] antialiased selection:bg-[#F59E0B] selection:text-[#090B10]">
        <div className="fixed inset-0 pointer-events-none z-0 bg-grid-pattern opacity-35" />
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[360px] bg-amber-500/8 blur-[140px] pointer-events-none z-0 rounded-full" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
