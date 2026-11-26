export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const cron = (await import("node-cron")).default;
    const { runAutomation } = await import("@/lib/alerts");
    const { ensureSeeded } = await import("@/lib/seed");

    // Bootstrap demo data once the database is reachable.
    ensureSeeded().catch((error) => {
      console.error("[bootstrap] seed skipped:", error instanceof Error ? error.message : error);
    });

    // Daily inventory scan: expiry tiers, reorder alerts, auto-quarantine, redistribution.
    cron.schedule(
      "0 2 * * *",
      async () => {
        try {
          const summary = await runAutomation("cron");
          console.log("[cron] automation complete", summary);
        } catch (error) {
          console.error("[cron] automation failed:", error instanceof Error ? error.message : error);
        }
      },
      { timezone: "Asia/Karachi" },
    );

    // Hourly expiry sweep keeps hard locks accurate even without the daily job.
    cron.schedule("15 * * * *", async () => {
      try {
        await runAutomation("cron-hourly");
      } catch (error) {
        console.error("[cron] hourly sweep failed:", error instanceof Error ? error.message : error);
      }
    });
    console.log("[cron] MediCare automation scheduler registered");
  } catch (error) {
    console.error("[cron] scheduler failed to start:", error instanceof Error ? error.message : error);
  }
}
