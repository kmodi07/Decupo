import { json, withAuth } from "@/server/http";
import { listEvents } from "@/server/missions/events";
import { getMission } from "@/server/missions/service";
import { TERMINAL_MISSION } from "@/server/missions/state";

const POLL_MS = 1000;
const HEARTBEAT_MS = 15_000;

/**
 * Mission event stream. With `Accept: text/event-stream` this is a Server-Sent
 * Events feed resumable via `Last-Event-ID` (or `?after=<seq>`); otherwise it
 * returns the events as JSON. Polling the append-only table keeps it correct
 * across web and worker processes without a broker.
 */
export const GET = withAuth<{ id: string }>(async (req, { db, ctx }, { id }) => {
  await getMission(db, ctx, id); // tenant check
  const url = new URL(req.url);
  const lastIdHeader = req.headers.get("last-event-id");
  let after = Number(lastIdHeader ?? url.searchParams.get("after") ?? 0) || 0;

  if (!(req.headers.get("accept") ?? "").includes("text/event-stream")) {
    const events = await listEvents(db, ctx.orgId, id, after);
    return json({ events });
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", stop);
      send(`retry: ${POLL_MS * 3}\n\n`);
      let lastBeat = Date.now();
      while (!closed) {
        const events = await listEvents(db, ctx.orgId, id, after);
        for (const e of events) {
          after = e.seq;
          send(`id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
        }
        const mission = await getMission(db, ctx, id);
        if (TERMINAL_MISSION.has(mission.status) && events.length === 0) {
          send(`event: done\ndata: ${JSON.stringify({ status: mission.status })}\n\n`);
          stop();
          break;
        }
        if (Date.now() - lastBeat > HEARTBEAT_MS) {
          send(`: keep-alive\n\n`);
          lastBeat = Date.now();
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
