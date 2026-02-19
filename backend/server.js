require("dotenv").config();

const cors = require("cors");
const express = require("express");
const http = require("http");
const { connectToMongo } = require("./db");
const { createGoogleAuthRouter } = require("./routes/googleAuthRoutes");
const { usernameRouter } = require("./routes/usernameRoutes");
const { setupChatSocket } = require("./ws/chatSocket");

const app = express();
const server = http.createServer(app);

const port = Number(process.env.PORT || 8080);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

connectToMongo();

app.use(
  cors({
    origin: frontendUrl,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", createGoogleAuthRouter({ frontendUrl }));
app.use("/users", usernameRouter);

setupChatSocket(server);

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`WebSocket server running on ws://localhost:${port}`);
});
