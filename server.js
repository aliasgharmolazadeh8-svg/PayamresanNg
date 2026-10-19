
const express = require("express");
const http = require("http");
const path = require("path");
const { randomUUID } = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024
});

const PORT = process.env.PORT || 3000;
const HISTORY_LIMIT = 100;
const MAX_NAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 1000;

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public")));

const users = new Map();
const history = [];
const rateLimits = new Map();

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getUserCount() {
  return users.size;
}

function broadcastUserCount() {
  io.emit("lobby:users", getUserCount());
}

function addSystemMessage(text) {
  const message = {
    id: randomUUID(),
    type: "system",
    text,
    time: new Date().toISOString()
  };

  history.push(message);

  if (history.length > HISTORY_LIMIT) {
    history.shift();
  }

  io.emit("lobby:message", message);
}

function canSend(socket) {
  const now = Date.now();
  let data = rateLimits.get(socket.id);

  if (!data || now - data.startedAt >= 10000) {
    data = { startedAt: now, count: 0 };
  }

  data.count += 1;
  rateLimits.set(socket.id, data);

  return data.count <= 15;
}

io.on("connection", socket => {
  socket.emit("lobby:history", history);
  socket.emit("lobby:users", getUserCount());

  socket.on("user:join", rawName => {
    if (users.has(socket.id)) return;

    const name = cleanText(rawName, MAX_NAME_LENGTH);

    if (!name) {
      socket.emit("lobby:error", "لطفاً یک اسم معتبر وارد کن.");
      return;
    }

    const user = {
      id: socket.id,
      name,
      joinedAt: new Date().toISOString()
    };

    users.set(socket.id, user);
    socket.emit("user:ready", {
      id: socket.id,
      name: user.name
    });

    addSystemMessage(`${name} وارد لابی شد.`);
    broadcastUserCount();
  });

  socket.on("lobby:send", rawText => {
    const user = users.get(socket.id);

    if (!user) {
      socket.emit("lobby:error", "اول اسمت رو وارد کن.");
      return;
    }

    if (!canSend(socket)) {
      socket.emit(
        "lobby:error",
        "کمی صبر کن و بعد دوباره پیام بفرست."
      );
      return;
    }

    const text = cleanText(rawText, MAX_MESSAGE_LENGTH);

    if (!text) return;

    const message = {
      id: randomUUID(),
      type: "chat",
      userId: socket.id,
      name: user.name,
      text,
      time: new Date().toISOString()
    };

    history.push(message);

    if (history.length > HISTORY_LIMIT) {
      history.shift();
    }

    io.emit("lobby:message", message);
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);

    if (user) {
      users.delete(socket.id);
      addSystemMessage(`${user.name} از لابی خارج شد.`);
      broadcastUserCount();
    }

    rateLimits.delete(socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Orange Lobby is running on port ${PORT}`);
});
