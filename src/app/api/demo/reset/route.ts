import { NextResponse } from "next/server";
import { resetDatabaseToSeed } from "@/lib/db";
import { handleApiError } from "@/lib/api-response";

export async function POST() {
  try {
    await resetDatabaseToSeed();
    return NextResponse.json({
      ok: true,
      message:
        "Base de datos restaurada al estado inicial de demostración (Seed).",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
