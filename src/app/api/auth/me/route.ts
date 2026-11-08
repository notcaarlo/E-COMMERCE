import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleApiError } from "@/lib/api-response";

export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
