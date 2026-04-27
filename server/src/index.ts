import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { LobbyStore, PlayerInput, RoomState } from "./lobby.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

const lobbies = new LobbyStore();
const socketToRoom = new Map<string, string>();
const SIM_TICK_MS = 40;

const roomSnapshot = (room: RoomState) => ({
  ...lobbies.snapshot(room),
  lobbyId: room.roomId,
});

io.on("connection", (socket) => {
  socket.emit("connected", { socketId: socket.id });

  const handleCreateRoom = () => {
    const room = lobbies.createRoom(socket.id);
    socketToRoom.set(socket.id, room.roomId);
    socket.join(room.roomId);

    socket.emit("room_created", roomSnapshot(room));
    socket.emit("lobby:created", roomSnapshot(room));
  };

  socket.on("create_room", handleCreateRoom);
  socket.on("lobby:create", handleCreateRoom);

  const handleJoinRoom = (payload: { roomId?: string; lobbyId?: string }) => {
    const roomId = payload.roomId?.toUpperCase?.().trim?.() ?? payload.lobbyId?.toUpperCase?.().trim?.();
    if (!roomId) {
      socket.emit("room_error", { message: "Room ID is required." });
      socket.emit("lobby:error", { message: "Lobby ID is required." });
      return;
    }

    const joined = lobbies.joinRoom(roomId, socket.id);
    if (!joined.room) {
      const message = joined.reason === "ROOM_FULL" ? "Room is full (2 players max)." : "Room not found.";
      socket.emit("room_error", { message });
      socket.emit("lobby:error", { message: "Lobby full or not found." });
      return;
    }
    const room = joined.room;

    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);

    io.to(roomId).emit("room_joined", roomSnapshot(room));
    io.to(roomId).emit("lobby:update", roomSnapshot(room));
    if (room.gameState.started) {
      io.to(roomId).emit("start_game", roomSnapshot(room));
      io.to(roomId).emit("game:start", roomSnapshot(room));
    }
  };

  socket.on("join_room", handleJoinRoom);
  socket.on("lobby:join", handleJoinRoom);

  const handlePlayerInput = (payload: { roomId?: string; lobbyId?: string; input: PlayerInput }) => {
    const roomId = payload.roomId ?? payload.lobbyId ?? socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }
    lobbies.setInput(roomId, socket.id, payload.input);
  };

  socket.on("player_input", handlePlayerInput);
  socket.on("player:state", (payload: { lobbyId: string; seq: number; input: PlayerInput }) => {
    handlePlayerInput({ roomId: payload.lobbyId, input: { ...payload.input, seq: payload.seq } });
  });

  socket.on("start_game", (payload: { roomId?: string }) => {
    const roomId = payload.roomId ?? socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }
    const room = lobbies.getRoom(roomId);
    if (!room || room.players.length !== 2) {
      socket.emit("room_error", { message: "Need exactly 2 players to start." });
      return;
    }
    room.gameState.started = true;
    io.to(roomId).emit("start_game", roomSnapshot(room));
    io.to(roomId).emit("game:start", roomSnapshot(room));
  });

  socket.on("game:fail", (payload: { lobbyId?: string; roomId?: string; reason: string }) => {
    const roomId = payload.roomId ?? payload.lobbyId;
    if (!roomId) {
      return;
    }
    const room = lobbies.getRoom(roomId);
    if (!room) {
      return;
    }

    io.to(roomId).emit("game:reset", {
      reason: payload.reason,
      level: room.gameState.level,
      ts: Date.now(),
    });
  });

  const handleLevelComplete = (payload: {
    roomId?: string;
    lobbyId?: string;
    deaths: number;
    syncBonus: boolean;
    perfectBonus: boolean;
  }) => {
      const roomId = payload.roomId ?? payload.lobbyId;
      if (!roomId) {
        return;
      }
      const bonusCoins = 25 + (payload.syncBonus ? 20 : 0) + (payload.perfectBonus ? 30 : 0) - payload.deaths * 5;
      const room = lobbies.completeLevel(roomId, Math.max(10, bonusCoins));
      if (!room) {
        return;
      }

      io.to(roomId).emit("level:advanced", roomSnapshot(room));
      io.to(roomId).emit("game_state_update", roomSnapshot(room));
  };

  socket.on("level_complete", handleLevelComplete);
  socket.on("level:complete", handleLevelComplete);

  socket.on("coins:add", (payload: { lobbyId?: string; roomId?: string; amount: number }) => {
    const roomId = payload.roomId ?? payload.lobbyId;
    if (!roomId) {
      return;
    }
    const room = lobbies.updateCoins(roomId, socket.id, payload.amount);
    if (!room) {
      return;
    }

    io.to(roomId).emit("lobby:update", roomSnapshot(room));
    io.to(roomId).emit("game_state_update", roomSnapshot(room));
  });

  socket.on("debug_ping", (payload: { ts: number }) => {
    socket.emit("debug_pong", { ts: payload.ts });
  });

  socket.on("disconnect", () => {
    const knownRoom = socketToRoom.get(socket.id);
    socketToRoom.delete(socket.id);

    const removal = lobbies.removePlayer(socket.id);
    if (!removal) {
      return;
    }

    const roomId = removal.roomId || knownRoom;
    if (!roomId || removal.roomDeleted) {
      return;
    }

    const room = lobbies.getRoom(roomId);
    if (!room) {
      return;
    }

    io.to(roomId).emit("player_disconnected", { socketId: socket.id, roomId });
    io.to(roomId).emit("lobby:update", roomSnapshot(room));
    io.to(roomId).emit("game:teammate-left", { message: "Teammate disconnected." });
  });
});

setInterval(() => {
  lobbies.stepSimulation(SIM_TICK_MS / 1000);
  for (const room of lobbies.allRooms()) {
    if (!room.gameState.started || room.players.length !== 2) {
      continue;
    }
    const snap = roomSnapshot(room);
    io.to(room.roomId).emit("game_state_update", snap);
    io.to(room.roomId).emit("state:snapshot", snap);
  }
}, SIM_TICK_MS);

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CoupleTie server running on port ${PORT}`);
});
