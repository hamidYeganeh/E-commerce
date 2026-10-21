import "../src/config/load-env";
import { parseArgs } from "node:util";
import { getDatabase, disconnectDatabase } from "../src/infrastructure/database/client";
import { createStaffAccount } from "../src/modules/identity/staff";

async function passwordPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("A local interactive terminal is required");
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let password = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n");
      if (error) reject(error); else resolve(password);
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") { finish(new Error("Cancelled")); return; }
        if (char === "\r" || char === "\n") { finish(); return; }
        if (char === "\u007f" || char === "\b") password = password.slice(0, -1);
        else if (char >= " " && char !== "\u001b") password += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
async function main() {
  try {
    const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "owner" } } });
    if (!values.email || !values.name) throw new Error("Usage: npm run staff:create -- --email owner@example.com --name Owner --role owner");
    const password = await passwordPrompt("Password (12–128 characters; hidden): ");
    if (password !== await passwordPrompt("Confirm password: ")) throw new Error("Passwords do not match");
    const user = await createStaffAccount(getDatabase(), { email: values.email, name: values.name, role: values.role!, password });
    console.info("Staff account created. Sign in at /staff/login and enroll TOTP before accessing admin.", user);
  } finally { await disconnectDatabase(); }
}
main().catch(() => { console.error("Staff creation failed. Check inputs, duplicate email, seeded role and database connectivity."); process.exitCode = 1; });
