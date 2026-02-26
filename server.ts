import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database
const db = new Database("messages.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    contactId TEXT,
    text TEXT,
    sender TEXT,
    timestamp TEXT,
    status TEXT DEFAULT 'sent'
  )
`);

const insertMessage = db.prepare(`
  INSERT INTO messages (id, contactId, text, sender, timestamp, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateMessageStatus = db.prepare(`
  UPDATE messages SET status = ? WHERE id = ?
`);

const markAllAsRead = db.prepare(`
  UPDATE messages SET status = 'read' WHERE contactId = ? AND sender != 'user' AND status != 'read'
`);

const getMessages = db.prepare(`
  SELECT * FROM messages WHERE contactId = ? ORDER BY timestamp ASC
`);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Store active connections and their user IDs
  const clients = new Map<WebSocket, string>();

  wss.on("connection", (ws) => {
    console.log("Client connected");

    ws.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        
        if (payload.type === "identify") {
          clients.set(ws, payload.userId);
          return;
        }

        if (payload.type === "message") {
          const { contactId, message } = payload;
          const status = message.status || 'sent';
          
          // Persist to DB
          insertMessage.run(
            message.id,
            contactId,
            message.text,
            message.sender,
            message.timestamp,
            status
          );

          // Broadcast message to all clients
          clients.forEach((_, client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(payload));
            }
          });
        } else if (payload.type === "get_history") {
          const history = getMessages.all(payload.contactId);
          ws.send(JSON.stringify({
            type: "history",
            contactId: payload.contactId,
            messages: history.map(m => ({
              ...m,
              timestamp: new Date(m.timestamp)
            }))
          }));
        } else if (payload.type === "typing" || payload.type === "read_receipt" || payload.type === "delivered_receipt") {
          const { contactId, messageId } = payload;
          if (payload.type === "read_receipt" || payload.type === "delivered_receipt") {
            const newStatus = payload.type === "read_receipt" ? 'read' : 'delivered';
            if (messageId) {
              updateMessageStatus.run(newStatus, messageId);
            } else if (contactId && newStatus === 'read') {
              markAllAsRead.run(contactId);
            }
          }
          // Broadcast to all clients
          clients.forEach((_, client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(payload));
            }
          });
        } else if (["call_request", "call_response", "webrtc_signal"].includes(payload.type)) {
          // Route signaling messages to the target user
          const targetUserId = payload.targetId;
          clients.forEach((userId, client) => {
            if (userId === targetUserId && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(payload));
            }
          });
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log("Client disconnected");
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
