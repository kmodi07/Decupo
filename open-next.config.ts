import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: every page that reads the database is dynamic, and
// the landing page is small enough to render on each request.
export default defineCloudflareConfig();
