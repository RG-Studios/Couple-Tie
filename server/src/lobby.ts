import { randomBytes } from "node:crypto";

export type PlayerInput = {
  left: boolean;
  right: boolean;
  jump: boolean;
  seq: number;
};

export type NetPlayer = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  input: PlayerInput;
  coins: number;
  alive: boolean;
  seq: number;
  lastProcessedInput: number;
  updatedAt: number;
  prevJumpPressed: boolean;
};

export type ChainState = {
  maxLength: number;
  slack: number;
  stiffness: number;
  damping: number;
  currentLength: number;
  tension: number;
};

export type GameState = {
  tick: number;
  level: number;
  started: boolean;
  players: NetPlayer[];
  chain: ChainState;
};

export type RoomState = {
  roomId: string;
  createdAt: number;
  players: string[];
  gameState: GameState;
  unlockedLevels: number;
  seed: number;
};

const MAX_PLAYERS = 2;
const WORLD_WIDTH = 2300;
const WORLD_GROUND_Y = 780;
const MOVE_ACCEL = 1500;
const MAX_SPEED_X = 280;
const GRAVITY = 1100;
const JUMP_VELOCITY = -460;

const defaultInput = (): PlayerInput => ({ left: false, right: false, jump: false, seq: 0 });

const defaultChain = (): ChainState => ({
  maxLength: 165,
  slack: 24,
  stiffness: 40,
  damping: 8,
  currentLength: 100,
  tension: 0,
});

const createPlayer = (id: string, x: number): NetPlayer => ({
  id,
  x,
  y: 640,
  vx: 0,
  vy: 0,
  grounded: false,
  input: defaultInput(),
  coins: 0,
  alive: true,
  seq: 0,
  lastProcessedInput: 0,
  updatedAt: Date.now(),
  prevJumpPressed: false,
});

const makeLobbyId = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
};

export class LobbyStore {
  private rooms = new Map<string, RoomState>();

  createRoom(hostId: string): RoomState {
    let roomId = makeLobbyId();
    while (this.rooms.has(roomId)) {
      roomId = makeLobbyId();
    }

    const room: RoomState = {
      roomId,
      createdAt: Date.now(),
      players: [hostId],
      gameState: {
        tick: 0,
        level: 1,
        started: false,
        players: [createPlayer(hostId, 220)],
        chain: defaultChain(),
      },
      unlockedLevels: 1,
      seed: Math.floor(Math.random() * 1_000_000),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  joinRoom(roomId: string, playerId: string): { room: RoomState | null; reason?: "NOT_FOUND" | "ROOM_FULL" } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { room: null, reason: "NOT_FOUND" };
    }
    if (room.players.length >= MAX_PLAYERS) {
      return { room: null, reason: "ROOM_FULL" };
    }
    if (!room.players.includes(playerId)) {
      room.players.push(playerId);
      room.gameState.players.push(createPlayer(playerId, 320));
    }

    if (room.players.length === MAX_PLAYERS) {
      room.gameState.started = true;
    }

    return { room };
  }

  removePlayer(playerId: string): { roomId: string; roomDeleted: boolean } | null {
    let foundRoom: RoomState | undefined;

    for (const room of this.rooms.values()) {
      if (room.players.includes(playerId)) {
        foundRoom = room;
        break;
      }
    }

    if (!foundRoom) {
      return null;
    }

    foundRoom.players = foundRoom.players.filter((id) => id !== playerId);
    foundRoom.gameState.players = foundRoom.gameState.players.filter((player) => player.id !== playerId);
    foundRoom.gameState.started = false;

    if (foundRoom.players.length === 0) {
      this.rooms.delete(foundRoom.roomId);
      return { roomId: foundRoom.roomId, roomDeleted: true };
    }

    return { roomId: foundRoom.roomId, roomDeleted: false };
  }

  findRoomByPlayer(playerId: string): RoomState | null {
    for (const room of this.rooms.values()) {
      if (room.players.includes(playerId)) {
        return room;
      }
    }
    return null;
  }

  setInput(roomId: string, playerId: string, input: PlayerInput): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    const player = room.gameState.players.find((entry) => entry.id === playerId);
    if (!player) {
      return null;
    }

    player.input = input;
    player.seq = input.seq;
    player.lastProcessedInput = input.seq;
    player.updatedAt = Date.now();
    return room;
  }

  updateCoins(roomId: string, playerId: string, coinsDelta: number): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }
    const player = room.gameState.players.find((entry) => entry.id === playerId);
    if (!player) {
      return null;
    }
    player.coins = Math.max(0, player.coins + coinsDelta);
    player.updatedAt = Date.now();
    return room;
  }

  stepSimulation(dt: number): void {
    for (const room of this.rooms.values()) {
      const state = room.gameState;
      if (!state.started || state.players.length !== MAX_PLAYERS) {
        continue;
      }

      state.tick += 1;

      for (const player of state.players) {
        const moveAxis = Number(player.input.right) - Number(player.input.left);
        player.vx += moveAxis * MOVE_ACCEL * dt;

        if (moveAxis === 0) {
          player.vx *= 0.8;
        }

        player.vx = Math.max(-MAX_SPEED_X, Math.min(MAX_SPEED_X, player.vx));

        const jumpPressed = player.input.jump;
        if (jumpPressed && player.grounded && !player.prevJumpPressed) {
          player.vy = JUMP_VELOCITY;
          player.grounded = false;
        }
        player.prevJumpPressed = jumpPressed;

        player.vy += GRAVITY * dt;

        player.x += player.vx * dt;
        player.y += player.vy * dt;

        player.x = Math.max(30, Math.min(WORLD_WIDTH - 30, player.x));
        if (player.y >= WORLD_GROUND_Y) {
          player.y = WORLD_GROUND_Y;
          player.vy = 0;
          player.grounded = true;
        }
      }

      this.applyChainConstraint(state);
    }
  }

  private applyChainConstraint(state: GameState): void {
    if (state.players.length !== MAX_PLAYERS) {
      return;
    }
    const [a, b] = state.players;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(0.001, Math.hypot(dx, dy));

    state.chain.currentLength = dist;
    const over = dist - state.chain.maxLength;
    if (over <= 0) {
      state.chain.tension = 0;
      return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const relVelN = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    const impulse = over * state.chain.stiffness + relVelN * state.chain.damping;

    a.vx += nx * impulse * 0.5;
    a.vy += ny * impulse * 0.45;
    b.vx -= nx * impulse * 0.5;
    b.vy -= ny * impulse * 0.45;

    const correction = Math.max(0, over - state.chain.slack) * 0.5;
    a.x += nx * correction;
    a.y += ny * correction;
    b.x -= nx * correction;
    b.y -= ny * correction;

    state.chain.tension = over;
  }

  snapshot(room: RoomState): {
    roomId: string;
    createdAt: number;
    started: boolean;
    level: number;
    unlockedLevels: number;
    seed: number;
    players: Omit<NetPlayer, "prevJumpPressed">[];
    chain: ChainState;
    tick: number;
  } {
    return {
      roomId: room.roomId,
      createdAt: room.createdAt,
      started: room.gameState.started,
      level: room.gameState.level,
      unlockedLevels: room.unlockedLevels,
      seed: room.seed,
      tick: room.gameState.tick,
      chain: { ...room.gameState.chain },
      players: room.gameState.players.map((player) => ({
        id: player.id,
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        grounded: player.grounded,
        input: player.input,
        coins: player.coins,
        alive: player.alive,
        seq: player.seq,
        lastProcessedInput: player.lastProcessedInput,
        updatedAt: player.updatedAt,
      })),
    };
  }

  completeLevel(roomId: string, bonusCoins: number): RoomState | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    room.gameState.level += 1;
    room.unlockedLevels = Math.max(room.unlockedLevels, room.gameState.level);

    let i = 0;
    for (const player of room.gameState.players) {
      player.coins += bonusCoins;
      player.x = 220 + i * 100;
      player.y = 640;
      player.vx = 0;
      player.vy = 0;
      player.alive = true;
      player.input = defaultInput();
      player.prevJumpPressed = false;
      player.updatedAt = Date.now();
      i += 1;
    }

    return room;
  }

  allRooms(): RoomState[] {
    return [...this.rooms.values()];
  }
}
