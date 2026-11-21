import { sql } from "drizzle-orm";
import { getDbHandle } from "@/server/db/client";
import { countByStatus } from "@/server/jobs/queue";
import { json } from "@/server/http";
import { llmStatus } from "@/server/llm";

export async function GET() {
  try {
    const h = await getDbHandle();
    await h.db.execute(sql`select 1`);
    const jobs = await countByStatus(h.db);
    return json({ ok: true, driver: h.driver, jobs, llm: llmStatus(), workerInline: (globalThis as { __decupoWorker?: boolean }).__decupoWorker === true });
  } catch (err) {
    // Surface the cause chain (driver errors are wrapped by the query layer); never the connection string.
    const chain: string[] = [];
    for (let e: unknown = err; e && chain.length < 4; e = (e as { cause?: unknown }).cause) chain.push(String((e as Error).message ?? e));
    return json({ ok: false, error: chain.join(" <- ") }, { status: 503 });
  }
}
