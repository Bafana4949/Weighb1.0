import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Separate from vitest.config.ts on purpose: these tests hit a real Postgres
 * (no mocked Prisma) to prove tenant-isolation claims that a mocked client
 * can't honestly prove. Kept out of the fast `npm test` loop so unrelated
 * phases aren't slowed down waiting on a DB connection — run explicitly via
 * `npm run test:integration`, and only from inside the weighbridge-web-test
 * container (the host's localhost:5432 is a different Postgres instance;
 * only the container's Docker network resolves `postgres:5432` correctly).
 */
export default defineConfig({
  test: { environment: "node", include: ["src/tests/integration/**/*.test.ts"], testTimeout: 20000, hookTimeout: 20000 },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
