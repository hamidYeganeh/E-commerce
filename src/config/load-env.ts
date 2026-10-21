import { loadEnvConfig } from "@next/env";

// Keep CLI and worker configuration consistent with the Next.js application.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
