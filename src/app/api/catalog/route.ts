import { NextResponse } from "next/server";
import { getCatalogWithStock } from "@/lib/services/inventory.service";
import { handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await getCatalogWithStock();
    return NextResponse.json({ products });
  } catch (err) {
    return handleApiError(err);
  }
}
