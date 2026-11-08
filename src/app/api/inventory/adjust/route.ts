import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { adjustStockManually } from "@/lib/services/inventory.service";
import { handleApiError } from "@/lib/api-response";

export async function POST(req: Request) {
  try {
    // Note: adjustStockManually also validates role inside the domain service
    const user = await requireAuth();
    const body = await req.json();

    const result = await adjustStockManually({
      variantId: body.variantId,
      operation: body.operation,
      quantity: Number(body.quantity),
      reason: body.reason || "",
      actor: user,
    });

    return NextResponse.json({ result });
  } catch (err) {
    return handleApiError(err);
  }
}
