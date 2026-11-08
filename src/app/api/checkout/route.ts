import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { createOrderAndReserveStock } from "@/lib/services/checkout.service";
import { handleApiError } from "@/lib/api-response";

export async function POST(req: Request) {
  try {
    const user = await requireAuth(["CUSTOMER", "ADMIN"]);
    const body = await req.json();

    const result = await createOrderAndReserveStock({
      customerId: user.id,
      items: body.items ?? [],
      idempotencyKey: body.idempotencyKey ?? "",
      ttlSeconds: body.ttlSeconds ?? 900, // 15 minutes default
      notes: body.notes,
    });

    return NextResponse.json(result, {
      status: result.idempotentReplay ? 200 : 201,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
