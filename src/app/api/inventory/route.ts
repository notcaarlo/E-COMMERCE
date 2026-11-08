import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { getInventoryAndLedger } from "@/lib/services/inventory.service";
import { handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAuth(["WAREHOUSE_OPERATOR", "SUPPORT", "ADMIN"]);
    const { searchParams } = new URL(req.url);
    const variantId = searchParams.get("variantId") || undefined;
    const movementType = searchParams.get("movementType") || undefined;

    const data = await getInventoryAndLedger({
      variantId,
      movementType,
      limit: 120,
    });

    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
