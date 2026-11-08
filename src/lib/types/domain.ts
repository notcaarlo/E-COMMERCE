export type Role = "CUSTOMER" | "WAREHOUSE_OPERATOR" | "SUPPORT" | "ADMIN";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "EXPIRED"
  | "CANCELLED"
  | "RETURN_REQUESTED"
  | "RETURNED"
  | "REFUND_PENDING"
  | "REFUNDED";

export type ReservationStatus =
  | "ACTIVE"
  | "CONFIRMED"
  | "RELEASED_EXPIRED"
  | "RELEASED_CANCELLED"
  | "COMMITTED";

export type MovementType =
  | "RESTOCK"
  | "RESERVE"
  | "RELEASE_EXPIRED"
  | "RELEASE_CANCELLED"
  | "COMMIT_SALE"
  | "RETURN_TO_AVAILABLE"
  | "RETURN_TO_DAMAGED"
  | "MANUAL_ADJUSTMENT";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface ProductVariantDTO {
  id: string;
  productId: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  priceCents: number;
  inventory: {
    id: string;
    onHand: number;
    available: number;
    reserved: number;
    damaged: number;
    version: number;
  };
}

export interface ProductDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  variants: ProductVariantDTO[];
}

export interface OrderItemDTO {
  id: string;
  orderId: string;
  variantId: string;
  skuSnapshot: string;
  nameSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  returnedToGood: number;
  returnedToDamaged: number;
}

export interface OrderStateHistoryDTO {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorId: string | null;
  actorName?: string | null;
  actorRole: string;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  idempotencyKey: string;
  reservationExpiresAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDTO[];
  stateHistory: OrderStateHistoryDTO[];
}

export interface InventoryLedgerDTO {
  id: string;
  inventoryItemId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  movementType: MovementType;
  quantityDelta: number;
  onHandAfter: number;
  availableAfter: number;
  reservedAfter: number;
  damagedAfter: number;
  referenceType: string;
  referenceId: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  reason: string;
  createdAt: string;
}

export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = "DOMAIN_ERROR",
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
