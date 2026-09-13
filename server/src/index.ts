import { createApp } from "./app";
import { env } from "./config/env";
import { checkDatabaseConnection } from "./config/db";

async function start() {
  const app = createApp();

  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    console.warn(
      "⚠️  Could not reach the database on startup. The server will still start, " +
        "but /api/health will report 'degraded' until PostgreSQL is reachable."
    );
  }

  app.listen(env.port, () => {
    console.log(`MEALVEST API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    console.log(`Health check: http://localhost:${env.port}/api/health`);
  });
}

start().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
