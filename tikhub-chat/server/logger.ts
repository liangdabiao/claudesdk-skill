import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, `chat-${new Date().toISOString().slice(0, 10)}.log`);

let initialized = false;

function ensureDir() {
  if (!initialized) {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    initialized = true;
  }
}

export function fileLog(tag: string, ...args: unknown[]) {
  ensureDir();
  const ts = new Date().toISOString().slice(11, 19);
  const line = args.map((a) => {
    if (typeof a === "object" && a !== null) {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(" ");
  const entry = `[${ts}][${tag}] ${line}\n`;
  fs.appendFileSync(LOG_FILE, entry, "utf-8");
  console.log(`[${ts}][${tag}]`, ...args);
}
