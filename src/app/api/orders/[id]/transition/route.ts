import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { transitionOrderState } from "@/lib/services/order-state.service";
import { handleApiError } from "@/lib/api-response";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const body = await req.json();

    const updatedOrder = await transitionOrderState({
      orderId: id,
      targetStatus: body.targetStatus,
      actor: user,
      reason: body.reason || "Cambio de estado ejecutado por usuario",
      returnInspection: body.returnInspection,
    });

    return NextResponse.json({ order: updatedOrder });
  } catch (err) {
    return handleApiError(err);
  }
}
