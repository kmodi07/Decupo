import { createDb } from "./client";

createDb({ migrate: true })
  .then(async (h) => {
    console.log(`migrations applied (${h.driver})`);
    await h.close();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
