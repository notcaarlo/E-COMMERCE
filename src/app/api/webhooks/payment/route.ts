import { NextResponse } from "next/server";
import { processPaymentWebhook } from "@/lib/services/payment-webhook.service";
import { handleApiError } from "@/lib/api-response";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await processPaymentWebhook({
      eventId: body.eventId || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orderId: body.orderId,
      eventType: body.eventType,
      forceExpireFirst: Boolean(body.forceExpireFirst),
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
