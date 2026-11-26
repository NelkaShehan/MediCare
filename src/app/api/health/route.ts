import { NextResponse } from "next/server";

import { ensureSeeded } from "@/lib/seed";

export async function GET() {
  let database = "unknown";
  let seeded = false;
  try {
    await ensureSeeded();
    seeded = true;
    database = "connected";
  } catch (error) {
    database = error instanceof Error ? `error: ${error.message}` : "error";
  }
  return NextResponse.json({
    status: "ok",
    service: "medicare-erp",
    database,
    seeded,
    timestamp: new Date().toISOString(),
  });
}
