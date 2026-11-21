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
    return json({ ok: false, error: String((err as Error).message ?? err) }, { status: 503 });
  }
}
