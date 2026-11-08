import React from "react";
import type { MovementType, OrderStatus, Role } from "@/lib/types/domain";

export const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  PENDING_PAYMENT: {
    label: "Reserva activa (pendiente de pago)",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-300",
    dotClass: "bg-amber-600",
  },
  PAID: {
    label: "Pagado (pendiente de preparación)",
    badgeClass: "bg-blue-50 text-blue-900 border-blue-200",
    dotClass: "bg-blue-600",
  },
  PROCESSING: {
    label: "En preparación de almacén",
    badgeClass: "bg-indigo-50 text-indigo-900 border-indigo-200",
    dotClass: "bg-indigo-600",
  },
  SHIPPED: {
    label: "Enviado",
    badgeClass: "bg-emerald-50 text-emerald-900 border-emerald-200",
    dotClass: "bg-emerald-600",
  },
  DELIVERED: {
    label: "Entregado",
    badgeClass: "bg-emerald-100/80 text-emerald-950 border-emerald-300",
    dotClass: "bg-emerald-700",
  },
  EXPIRED: {
    label: "Reserva vencida",
    badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
    dotClass: "bg-stone-500",
  },
  CANCELLED: {
    label: "Cancelado",
    badgeClass: "bg-rose-50 text-rose-900 border-rose-200",
    dotClass: "bg-rose-600",
  },
  RETURN_REQUESTED: {
    label: "Devolución solicitada",
    badgeClass: "bg-orange-50 text-orange-900 border-orange-200",
    dotClass: "bg-orange-600",
  },
  RETURNED: {
    label: "Devolución recibida e inspeccionada",
    badgeClass: "bg-teal-50 text-teal-900 border-teal-200",
    dotClass: "bg-teal-600",
  },
  REFUND_PENDING: {
    label: "Reembolso pendiente",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-300",
    dotClass: "bg-amber-600",
  },
  REFUNDED: {
    label: "Reembolsado",
    badgeClass: "bg-stone-100 text-stone-800 border-stone-300",
    dotClass: "bg-stone-600",
  },
};

export const ROLE_CONFIG: Record<
  Role,
  { label: string; badgeClass: string; description: string }
> = {
  CUSTOMER: {
    label: "Cliente",
    badgeClass: "bg-stone-100 text-stone-800 border-stone-300",
    description:
      "Compra con reserva de 15 minutos, cancela antes de entrar a almacén y solicita devoluciones",
  },
  WAREHOUSE_OPERATOR: {
    label: "Operador de almacén",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-300",
    description:
      "Prepara y envía pedidos, recibe mercancía, ajusta inventario e inspecciona devoluciones",
  },
  SUPPORT: {
    label: "Atención al cliente",
    badgeClass: "bg-blue-50 text-blue-900 border-blue-200",
    description:
      "Atiende incidencias, aprueba reembolsos y cancelaciones asistidas sin modificar el stock físico",
  },
  ADMIN: {
    label: "Administrador",
    badgeClass: "bg-emerald-50 text-emerald-900 border-emerald-300",
    description:
      "Acceso completo a catálogo, operaciones de almacén, estados de pedidos y registro contable",
  },
};

export const MOVEMENT_TYPE_CONFIG: Record<
  MovementType,
  { label: string; badgeClass: string }
> = {
  RESTOCK: {
    label: "Entrada de mercancía",
    badgeClass: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  RESERVE: {
    label: "Reserva en checkout",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-200",
  },
  RELEASE_EXPIRED: {
    label: "Liberación por tiempo vencido",
    badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
  },
  RELEASE_CANCELLED: {
    label: "Liberación por cancelación",
    badgeClass: "bg-blue-50 text-blue-900 border-blue-200",
  },
  COMMIT_SALE: {
    label: "Salida física por envío",
    badgeClass: "bg-stone-900 text-white border-stone-900",
  },
  RETURN_TO_AVAILABLE: {
    label: "Reingreso por devolución apta",
    badgeClass: "bg-teal-50 text-teal-900 border-teal-200",
  },
  RETURN_TO_DAMAGED: {
    label: "Ingreso a cuarentena por daño",
    badgeClass: "bg-rose-50 text-rose-900 border-rose-200",
  },
  MANUAL_ADJUSTMENT: {
    label: "Ajuste manual auditado",
    badgeClass: "bg-orange-50 text-orange-900 border-orange-200",
  },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cfg = ORDER_STATUS_CONFIG[status] ?? {
    label: status,
    badgeClass: "bg-stone-100 text-stone-800 border-stone-300",
    dotClass: "bg-stone-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium border ${cfg.badgeClass}`}
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
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
}

export function MovementBadge({ type }: { type: MovementType }) {
  const cfg = MOVEMENT_TYPE_CONFIG[type] ?? {
    label: type,
    badgeClass: "bg-stone-100 text-stone-700 border-stone-300",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.badgeClass}`}
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
