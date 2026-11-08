import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { getOrders } from "@/lib/services/order-state.service";
import { handleApiError } from "@/lib/api-response";
import type { OrderStatus } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") as OrderStatus | null;
    const scopeParam = searchParams.get("scope");

    // Customers can only see their own orders. Staff can see all orders (or filter by own if on customer view).
    const customerId =
      user.role === "CUSTOMER" || scopeParam === "mine" ? user.id : undefined;

    const orders = await getOrders({
      customerId,
      status: statusParam || undefined,
    });

    return NextResponse.json({ orders });
  } catch (err) {
    return handleApiError(err);
  }
}
