import { NextResponse } from "next/server";
import { authenticateUser, setSessionCookie } from "@/lib/auth/session";
import { handleApiError } from "@/lib/api-response";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;
    const user = await authenticateUser(email || "", password || "");
    await setSessionCookie(user);
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
