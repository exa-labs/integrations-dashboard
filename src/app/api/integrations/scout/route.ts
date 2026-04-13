import { NextResponse } from "next/server";
import { clearScoutRepos } from "@/lib/firebase-integrations";

/**
 * DELETE /api/integrations/scout
 * Clears all documents in the scout_repos collection.
 * Requires CRON_SECRET for authorization.
 */
export async function DELETE(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await clearScoutRepos();
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    console.error("[Scout API] Error clearing scout repos:", err);
    return NextResponse.json(
      { error: "Failed to clear scout repos" },
      { status: 500 },
    );
  }
}
