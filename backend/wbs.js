const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

const wss = new WebSocket.Server({ port: 8080 });

const rooms = new Map(); // roomId -> Set of clients

console.log("WebSocket server running on ws://localhost:8080");

const broadcastToRoom = (room, payload) => {
  if (!rooms.has(room)) return;

  rooms.get(room).forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

const broadcastSystemMessage = (room, text) => {
  const payload = JSON.stringify({
    username: "System",
    message: text,
    timestamp: new Date().toISOString(),
    system: true,
  });

  broadcastToRoom(room, payload);
};

wss.on("connection", (ws) => {
  ws.id = uuidv4();

  ws.on("message", (data) => {
    try {
      const parsed = JSON.parse(data);
      const { type, room, username, message } = parsed;

      if (type === "join") {
        if (!room || !username) return;

        if (!rooms.has(room)) {
          rooms.set(room, new Set());
        }

        rooms.get(room).add(ws);
        ws.room = room;
        ws.username = username;
        broadcastSystemMessage(room, `${username} joined the chat`);
      }

      if (type === "message") {
        if (!ws.room || !rooms.has(ws.room)) return;

        const payload = JSON.stringify({
          username: ws.username || username,
          message,
          timestamp: new Date().toISOString(),
        });

        broadcastToRoom(ws.room, payload);
      }
    } catch (err) {
      console.error("Invalid message format");
    }
  });

  ws.on("close", () => {
    if (ws.room && rooms.has(ws.room)) {
      rooms.get(ws.room).delete(ws);
      const name = ws.username || "A user";
      broadcastSystemMessage(ws.room, `${name} left the chat`);

      if (rooms.get(ws.room).size === 0) {
        rooms.delete(ws.room);
      }
    }
  });
});
