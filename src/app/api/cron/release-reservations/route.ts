import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@hamza/shared/supabase/admin";

// Release stock held by abandoned web orders. Runs automatically via pg_cron
// every 15 min; this route lets an external scheduler (or a manual call) trigger
// it too. Protected by CRON_SECRET when that env var is set.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const { data, error } = await db.rpc("release_expired_reservations");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, released: data });
}
