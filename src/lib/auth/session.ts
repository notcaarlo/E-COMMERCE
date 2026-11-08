import { cookies } from "next/headers";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { DomainError, type Role, type SessionUser } from "@/lib/types/domain";

const SESSION_COOKIE_NAME = "stockguard_session";
const SECRET_KEY =
  process.env.AUTH_SECRET || "stockguard-portfolio-secret-hmac-key-2026";

function signToken(payload: SessionUser): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const signature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

function verifyToken(token: string): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(data)
    .digest("base64url");
  if (signature !== expectedSig) return null;
  try {
    return JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    ) as SessionUser;
  } catch {
    return null;
  }
}

export async function authenticateUser(
  email: string,
  passwordPlain: string
): Promise<SessionUser> {
  const db = await getDb();
  const res = await db.query<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
    role: Role;
  }>(
    `SELECT id, email, name, password_hash, role
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );

  const user = res.rows[0];
  if (!user || user.password_hash !== passwordPlain) {
    throw new DomainError(
      "Credenciales inválidas. Verifica el correo y contraseña.",
      "INVALID_CREDENTIALS",
      401
    );
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = signToken(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

export async function requireAuth(allowedRoles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new DomainError(
      "Debes iniciar sesión para realizar esta operación.",
      "UNAUTHORIZED",
      401
    );
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new DomainError(
      `Tu rol actual (${user.role}) no tiene permisos para esta operación. Se requiere: ${allowedRoles.join(
        ", "
      )}.`,
      "FORBIDDEN",
      403
    );
  }
  return user;
}
