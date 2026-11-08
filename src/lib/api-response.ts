import { NextResponse } from "next/server";
import { DomainError } from "@/lib/types/domain";

export function handleApiError(err: unknown) {
  if (err instanceof DomainError) {
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        details: err.details ?? null,
      },
      { status: err.statusCode }
    );
  }

  console.error("[API Error]:", err);
  const message =
    err instanceof Error ? err.message : "Error interno del servidor";
  return NextResponse.json(
    {
      error: message,
      code: "INTERNAL_SERVER_ERROR",
    },
    { status: 500 }
  );
}
