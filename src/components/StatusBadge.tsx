import React from "react";
import type { MovementType, OrderStatus, Role } from "@/lib/types/domain";

export const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  PENDING_PAYMENT: {
    label: "Reserva Activa (Pendiente Pago)",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    dotClass: "bg-amber-500",
  },
  PAID: {
    label: "Pagado (Listo p/ Picking)",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    dotClass: "bg-blue-600",
  },
  PROCESSING: {
    label: "En Picking / Empaque",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
    dotClass: "bg-indigo-600",
  },
  SHIPPED: {
    label: "Enviado (Stock Descontado)",
    badgeClass: "bg-purple-50 text-purple-800 border-purple-200",
    dotClass: "bg-purple-600",
  },
  DELIVERED: {
    label: "Entregado",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-600",
  },
  EXPIRED: {
    label: "TTL Expirado (Stock Liberado)",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    dotClass: "bg-slate-500",
  },
  CANCELLED: {
    label: "Cancelado (Stock Liberado)",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
    dotClass: "bg-rose-500",
  },
  RETURN_REQUESTED: {
    label: "Devolución Solicitada",
    badgeClass: "bg-orange-50 text-orange-800 border-orange-200",
    dotClass: "bg-orange-500",
  },
  RETURNED: {
    label: "Devuelto e Inspeccionado",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
    dotClass: "bg-teal-600",
  },
  REFUND_PENDING: {
    label: "Reembolso Pendiente",
    badgeClass: "bg-yellow-50 text-yellow-900 border-yellow-300",
    dotClass: "bg-yellow-600",
  },
  REFUNDED: {
    label: "Reembolsado",
    badgeClass: "bg-zinc-100 text-zinc-800 border-zinc-300",
    dotClass: "bg-zinc-600",
  },
};

export const ROLE_CONFIG: Record<
  Role,
  { label: string; badgeClass: string; description: string }
> = {
  CUSTOMER: {
    label: "Cliente",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
    description: "Compra con reserva TTL, cancela antes de picking y solicita devoluciones",
  },
  WAREHOUSE_OPERATOR: {
    label: "Operador de Almacén",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-300",
    description: "Picking/despacho, recepción de mercancía, ajustes con motivo e inspección de devoluciones",
  },
  SUPPORT: {
    label: "Soporte (CS)",
    badgeClass: "bg-purple-50 text-purple-800 border-purple-200",
    description: "Gestiona incidencias, aprueba reembolsos y cancelaciones asistidas (sin tocar stock físico)",
  },
  ADMIN: {
    label: "Administrador",
    badgeClass: "bg-emerald-50 text-emerald-900 border-emerald-300",
    description: "Acceso total a catálogo, almacén, estados de pedidos, Kardex y usuarios",
  },
};

export const MOVEMENT_TYPE_CONFIG: Record<
  MovementType,
  { label: string; badgeClass: string }
> = {
  RESTOCK: {
    label: "RESTOCK (+Entrada)",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  RESERVE: {
    label: "RESERVE (Retención TTL)",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
  },
  RELEASE_EXPIRED: {
    label: "RELEASE_EXPIRED (+Liberado TTL)",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
  RELEASE_CANCELLED: {
    label: "RELEASE_CANCELLED (+Liberado Cancelación)",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
  },
  COMMIT_SALE: {
    label: "COMMIT_SALE (-Salida Física Envío)",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  RETURN_TO_AVAILABLE: {
    label: "RETURN_TO_AVAILABLE (+Reingreso Apto)",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
  },
  RETURN_TO_DAMAGED: {
    label: "RETURN_TO_DAMAGED (+Cuarentena/Dañado)",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
  },
  MANUAL_ADJUSTMENT: {
    label: "MANUAL_ADJUSTMENT (Ajuste Auditado)",
    badgeClass: "bg-purple-50 text-purple-800 border-purple-200",
  },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cfg = ORDER_STATUS_CONFIG[status] ?? {
    label: status,
    badgeClass: "bg-slate-100 text-slate-800 border-slate-200",
    dotClass: "bg-slate-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.badgeClass}`}
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
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
}

export function MovementBadge({ type }: { type: MovementType }) {
  const cfg = MOVEMENT_TYPE_CONFIG[type] ?? {
    label: type,
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
