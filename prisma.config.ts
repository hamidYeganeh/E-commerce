import "./src/config/load-env";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Generation/validation must work without deployment credentials.
  datasource: { url: process.env.DATABASE_URL },
});
