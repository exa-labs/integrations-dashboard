import { NextRequest, NextResponse } from "next/server";
import { upsertIntegrations } from "@/lib/firebase-integrations";
import { SEED_INTEGRATIONS } from "@/lib/seed-data";

function isCronAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === process.env.CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      integrations?: Array<Record<string, unknown>>;
    };

    const dataToSeed =
      body.integrations && body.integrations.length > 0
        ? body.integrations
        : (SEED_INTEGRATIONS as unknown as Array<Record<string, unknown>>);

    const count = await upsertIntegrations(dataToSeed);

    return NextResponse.json({
      success: true,
      seeded: count,
      source: body.integrations ? "custom" : "builtin",
    });
  } catch (error) {
    console.error("[Seed API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
