import React from "react";
import type { MovementType, OrderStatus, Role } from "@/lib/types/domain";

export const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  PENDING_PAYMENT: {
    label: "RESERVA ACTIVA · PENDIENTE PAGO",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    dotClass: "bg-amber-400 animate-pulse",
  },
  PAID: {
    label: "PAGADO · LISTO P/ PICKING",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/40",
    dotClass: "bg-sky-400",
  },
  PROCESSING: {
    label: "EN PICKING / EMPAQUE",
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
    dotClass: "bg-cyan-400 animate-pulse",
  },
  SHIPPED: {
    label: "DESPACHADO · STOCK DESCONTADO",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    dotClass: "bg-emerald-400",
  },
  DELIVERED: {
    label: "ENTREGADO",
    badgeClass: "bg-emerald-500/20 text-emerald-200 border-emerald-400/50",
    dotClass: "bg-emerald-300",
  },
  EXPIRED: {
    label: "TTL EXPIRADO · STOCK LIBERADO",
    badgeClass: "bg-zinc-800/90 text-zinc-400 border-zinc-700",
    dotClass: "bg-zinc-500",
  },
  CANCELLED: {
    label: "CANCELADO · STOCK LIBERADO",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    dotClass: "bg-rose-400",
  },
  RETURN_REQUESTED: {
    label: "RMA · DEVOLUCIÓN SOLICITADA",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/40",
    dotClass: "bg-orange-400 animate-pulse",
  },
  RETURNED: {
    label: "RMA · INSPECCIONADO EN BODEGA",
    badgeClass: "bg-teal-500/15 text-teal-300 border-teal-500/40",
    dotClass: "bg-teal-400",
  },
  REFUND_PENDING: {
    label: "REEMBOLSO PENDIENTE",
    badgeClass: "bg-yellow-500/15 text-yellow-200 border-yellow-500/40",
    dotClass: "bg-yellow-400 animate-pulse",
  },
  REFUNDED: {
    label: "REEMBOLSADO",
    badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-600",
    dotClass: "bg-zinc-400",
  },
};

export const ROLE_CONFIG: Record<
  Role,
  { label: string; badgeClass: string; description: string }
> = {
  CUSTOMER: {
    label: "CLIENTE",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/40",
    description:
      "Compra con reserva TTL, cancela antes de picking y solicita devoluciones",
  },
  WAREHOUSE_OPERATOR: {
    label: "OPERADOR ALMACÉN",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    description:
      "Picking/despacho, recepción de mercancía, ajustes con motivo e inspección de devoluciones",
  },
  SUPPORT: {
    label: "SOPORTE CS",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    description:
      "Gestiona incidencias, aprueba reembolsos y cancelaciones asistidas (sin tocar stock físico)",
  },
  ADMIN: {
    label: "ADMINISTRADOR",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    description:
      "Acceso total a catálogo, almacén, estados de pedidos, Kardex y usuarios",
  },
};

export const MOVEMENT_TYPE_CONFIG: Record<
  MovementType,
  { label: string; badgeClass: string }
> = {
  RESTOCK: {
    label: "RESTOCK (+ENTRADA)",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  },
  RESERVE: {
    label: "RESERVE (RETENCIÓN TTL)",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
  RELEASE_EXPIRED: {
    label: "RELEASE_EXPIRED (+TTL VENCIDO)",
    badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-700",
  },
  RELEASE_CANCELLED: {
    label: "RELEASE_CANCELLED (+CANCELACIÓN)",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  },
  COMMIT_SALE: {
    label: "COMMIT_SALE (-SALIDA DESPACHO)",
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  },
  RETURN_TO_AVAILABLE: {
    label: "RETURN_TO_AVAILABLE (+RMA APTO)",
    badgeClass: "bg-teal-500/15 text-teal-300 border-teal-500/40",
  },
  RETURN_TO_DAMAGED: {
    label: "RETURN_TO_DAMAGED (+CUARENTENA)",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  },
  MANUAL_ADJUSTMENT: {
    label: "MANUAL_ADJUSTMENT (AUDITORÍA)",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cfg = ORDER_STATUS_CONFIG[status] ?? {
    label: status,
    badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-700",
    dotClass: "bg-zinc-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold tracking-wider border ${cfg.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest border ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
}

export function MovementBadge({ type }: { type: MovementType }) {
  const cfg = MOVEMENT_TYPE_CONFIG[type] ?? {
    label: type,
    badgeClass: "bg-zinc-800 text-zinc-300 border-zinc-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
