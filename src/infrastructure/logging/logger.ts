import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "commerce" },
  redact: {
    paths: [
      "password", "token", "secret", "otp", "authorization", "cookie",
      "*.password", "*.token", "*.secret", "*.otp",
      "req.headers.authorization", "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
});
