import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { AgentSession, SDKMessage } from "./agent-client.js";
import { fileLog } from "./logger.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ClientWS extends WebSocket {
  isAlive: boolean;
  chatId?: string;
}

interface Session {
  id: string;
  agent: AgentSession;
  subscribers: Set<ClientWS>;
  listening: boolean;
}

interface OutMessage {
  type: string;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  success?: boolean;
  cost?: number;
  duration?: number;
  error?: string;
}

const sessions = new Map<string, Session>();

function getOrCreateSession(chatId: string): Session {
  let session = sessions.get(chatId);
  if (!session) {
    fileLog("Server", "New session:", chatId);
    session = { id: chatId, agent: new AgentSession(), subscribers: new Set(), listening: false };
    sessions.set(chatId, session);
  }
  return session;
}

function broadcast(session: Session, data: OutMessage) {
  const msg = JSON.stringify(data);
  fileLog("WS.out", data.type, data.toolName || data.content?.substring(0, 60) || "");
  for (const client of session.subscribers) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

function formatMessage(message: SDKMessage): OutMessage | null {
  if (message.type === "assistant" && message.message) {
    for (const block of message.message.content) {
      if (block.type === "text" && block.text) {
        return { type: "assistant_message", content: block.text };
      }
      if (block.type === "tool_use") {
        return { type: "tool_use", toolName: block.name, toolInput: block.input };
      }
    }
  }
  if (message.type === "result") {
    return { type: "result", success: message.subtype === "success", cost: message.total_cost_usd, duration: message.duration_ms };
  }
  return null;
}

async function startListening(session: Session) {
  if (session.listening) return;
  session.listening = true;

  try {
    for await (const message of session.agent.getOutputStream()) {
      const out = formatMessage(message);
      if (out) broadcast(session, out);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    fileLog("Server", "listen error:", msg);
    broadcast(session, { type: "error", error: msg });
  } finally {
    session.listening = false;
  }
}

// --- Express ---
const app = express();
app.use(express.json());
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("/api/sessions", (_req, res) => res.json([...sessions.keys()]));
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessions.size, env: {
    MODEL: process.env.MODEL || "(not set)",
    BASE_URL: process.env.ANTHROPIC_BASE_URL || "(not set)",
    HAS_KEY: !!process.env.ANTHROPIC_API_KEY,
    HAS_TIKHUB: !!process.env.TIKHUB_TOKEN,
  }});
});
app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));

// --- WebSocket ---
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws: ClientWS) => {
  fileLog("WS", "Client connected");
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (data) => {
    let msg: any;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    fileLog("WS.in", msg.type, (msg.content || msg.chatId || "").substring(0, 60));

    if (msg.type === "subscribe") {
      const chatId = msg.chatId || "default";
      const session = getOrCreateSession(chatId);
      session.subscribers.add(ws);
      ws.chatId = chatId;
      ws.send(JSON.stringify({ type: "subscribed", chatId }));
    }

    if (msg.type === "chat") {
      const chatId = msg.chatId || "default";
      const session = getOrCreateSession(chatId);
      session.subscribers.add(ws);
      ws.chatId = chatId;
      broadcast(session, { type: "user_message", content: msg.content });
      session.agent.sendMessage(msg.content);
      startListening(session);
    }
  });

  ws.on("close", () => {
    for (const session of sessions.values()) session.subscribers.delete(ws);
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    const c = ws as ClientWS;
    if (!c.isAlive) return c.terminate();
    c.isAlive = false;
    c.ping();
  });
}, 30000);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
server.listen(PORT, () => {
  fileLog("Server", `TikHub Chat Server listening on :${PORT}`);
});
