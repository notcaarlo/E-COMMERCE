import { NextResponse } from "next/server";
import { runExpireReservationsWorker } from "@/lib/services/inventory.service";
import { handleApiError } from "@/lib/api-response";

export async function POST() {
  try {
    const result = await runExpireReservationsWorker();
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
