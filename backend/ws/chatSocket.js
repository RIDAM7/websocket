const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const Message = require("../models/message");
const { verifyAuthToken } = require("../auth/jwt");
const {
  ALLOWED_ROLES,
  findUserFromAuthPayload,
  toSafeUser,
} = require("../services/userService");

const FIXED_ROOMS = ["room-1", "room-2", "room-3"];

const createRoomState = () => ({
  clients: new Set(),
  typingClients: new Set(),
  roles: {
    influencer: null,
    brand: null,
  },
});

const setupChatSocket = (server) => {
  const wss = new WebSocket.Server({ server });
  const rooms = new Map(FIXED_ROOMS.map((roomId) => [roomId, createRoomState()]));

  const sendToClient = (client, payload) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  };

  const broadcastToRoom = (roomId, payload) => {
    if (!rooms.has(roomId)) return;

    rooms.get(roomId).clients.forEach((client) => {
      sendToClient(client, payload);
    });
  };

  const broadcastSystemMessage = (roomId, text) => {
    const payload = JSON.stringify({
      type: "system",
      username: "System",
      message: text,
      timestamp: new Date().toISOString(),
      system: true,
    });

    broadcastToRoom(roomId, payload);
  };

  const broadcastRoomState = (roomId) => {
    if (!rooms.has(roomId)) return;

    const roomState = rooms.get(roomId);
    const occupants = [...roomState.clients]
      .filter((client) => client.username && client.role)
      .map((client) => ({
        username: client.username,
        role: client.role,
      }));

    const payload = JSON.stringify({
      type: "room_state",
      room: roomId,
      occupants,
    });

    broadcastToRoom(roomId, payload);
  };

  const broadcastTypingState = (roomId) => {
    if (!rooms.has(roomId)) return;

    const roomState = rooms.get(roomId);
    const users = [...roomState.typingClients]
      .filter(
        (client) =>
          roomState.clients.has(client) && client.username && client.role
      )
      .map((client) => ({
        username: client.username,
        role: client.role,
      }));

    const payload = JSON.stringify({
      type: "typing_state",
      room: roomId,
      users,
    });

    broadcastToRoom(roomId, payload);
  };

  const reject = (ws, message) => {
    sendToClient(
      ws,
      JSON.stringify({
        type: "error",
        message,
      })
    );
  };

  const getRoomHistory = async (roomId, limit = 80) => {
    const rows = await Message.find({ roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return rows.reverse().map((row) => ({
      type: "message",
      username: row.senderUsername,
      role: row.senderRole,
      message: row.text,
      timestamp: row.createdAt,
    }));
  };

  const removeClientFromRoom = (ws) => {
    if (!ws.room || !rooms.has(ws.room)) return;

    const roomState = rooms.get(ws.room);
    roomState.typingClients.delete(ws);
    roomState.clients.delete(ws);
    if (ws.role && roomState.roles[ws.role] === ws) {
      roomState.roles[ws.role] = null;
    }

    const name = ws.username || "A user";
    const roleText = ws.role ? ` (${ws.role})` : "";
    broadcastSystemMessage(ws.room, `${name}${roleText} left the chat`);
    broadcastRoomState(ws.room);
    broadcastTypingState(ws.room);
  };

  wss.on("connection", (ws) => {
    ws.id = uuidv4();
    sendToClient(
      ws,
      JSON.stringify({
        type: "room_options",
        rooms: FIXED_ROOMS,
      })
    );

    ws.on("message", async (data) => {
      try {
        const parsed = JSON.parse(data);
        const { type, room, authToken, message } = parsed;

        if (type === "join") {
          const requestedRoomId = typeof room === "string" ? room.trim() : "";
          const cleanAuthToken =
            typeof authToken === "string" ? authToken.trim() : "";

          if (!FIXED_ROOMS.includes(requestedRoomId)) {
            reject(ws, "Invalid room. Choose room-1, room-2, or room-3.");
            return;
          }

          if (!cleanAuthToken) {
            reject(ws, "Authentication is required.");
            return;
          }

          const authPayload = verifyAuthToken(cleanAuthToken);
          if (!authPayload) {
            reject(ws, "Invalid or expired authentication token.");
            return;
          }

          const user = await findUserFromAuthPayload(authPayload);
          if (!user) {
            reject(ws, "Authenticated user was not found.");
            return;
          }

          const userRole = `${user.role || ""}`.trim().toLowerCase();
          if (!ALLOWED_ROLES.includes(userRole)) {
            reject(ws, "User role is missing. Update your profile role first.");
            return;
          }

          if (ws.room) {
            reject(ws, "You are already in a room.");
            return;
          }

          const roomState = rooms.get(requestedRoomId);
          if (roomState.roles[userRole]) {
            reject(
              ws,
              `This room already has a ${userRole}. Choose a different room.`
            );
            return;
          }

          roomState.clients.add(ws);
          roomState.roles[userRole] = ws;

          ws.room = requestedRoomId;
          ws.username = user.username;
          ws.role = userRole;
          ws.userId = user._id.toString();

          sendToClient(
            ws,
            JSON.stringify({
              type: "joined",
              room: requestedRoomId,
              username: user.username,
              role: userRole,
              user: toSafeUser(user),
            })
          );

          const history = await getRoomHistory(requestedRoomId);
          sendToClient(
            ws,
            JSON.stringify({
              type: "history",
              room: requestedRoomId,
              messages: history,
            })
          );

          broadcastSystemMessage(
            requestedRoomId,
            `${user.username} (${userRole}) joined the chat`
          );
          broadcastRoomState(requestedRoomId);
          broadcastTypingState(requestedRoomId);
          return;
        }

        if (type === "sync_username") {
          if (!ws.userId || !ws.room) return;

          const authPayload = verifyAuthToken(
            typeof authToken === "string" ? authToken.trim() : ""
          );
          if (!authPayload) return;

          const user = await findUserFromAuthPayload(authPayload);
          if (!user || user._id.toString() !== ws.userId) return;

          const previous = ws.username;
          const previousRole = ws.role;
          ws.username = user.username;
          ws.role = user.role;

          if (ws.room && previousRole && ws.role !== previousRole) {
            ws.role = previousRole;
            sendToClient(
              ws,
              JSON.stringify({
                type: "error",
                message:
                  "Role updated in profile. Leave and rejoin for new role to take effect.",
              })
            );
          }

          if (ws.room && previous !== ws.username) {
            broadcastSystemMessage(
              ws.room,
              `${previous} changed username to ${ws.username}`
            );
            broadcastRoomState(ws.room);
            broadcastTypingState(ws.room);
          }
          return;
        }

        if (type === "typing") {
          if (!ws.room || !rooms.has(ws.room)) return;

          const roomState = rooms.get(ws.room);
          const nextTyping = Boolean(parsed.isTyping);

          if (nextTyping) {
            roomState.typingClients.add(ws);
          } else {
            roomState.typingClients.delete(ws);
          }

          broadcastTypingState(ws.room);
          return;
        }

        if (type === "message") {
          if (!ws.room || !rooms.has(ws.room)) return;

          const cleanMessage = typeof message === "string" ? message.trim() : "";
          if (!cleanMessage) return;

          const roomState = rooms.get(ws.room);
          roomState.typingClients.delete(ws);
          broadcastTypingState(ws.room);

          let stored;
          try {
            stored = await Message.create({
              roomId: ws.room,
              senderUserId: ws.userId,
              senderUsername: ws.username,
              senderRole: ws.role,
              text: cleanMessage,
            });
          } catch (error) {
            console.error("Failed to persist message:", error.message);
          }

          const payload = JSON.stringify({
            type: "message",
            username: ws.username,
            role: ws.role,
            message: cleanMessage,
            timestamp: stored?.createdAt || new Date().toISOString(),
          });

          broadcastToRoom(ws.room, payload);
        }
      } catch {
        console.error("Invalid message format");
      }
    });

    ws.on("close", () => {
      removeClientFromRoom(ws);
    });
  });

  return wss;
};

module.exports = {
  FIXED_ROOMS,
  setupChatSocket,
};
