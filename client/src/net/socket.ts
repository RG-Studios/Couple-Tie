import { io, Socket } from "socket.io-client";

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
  alive: boolean;
  seq: number;
  coins: number;
  input: PlayerInput;
  lastProcessedInput: number;
  updatedAt: number;
};

export type ChainState = {
  maxLength: number;
  slack: number;
  stiffness: number;
  damping: number;
  currentLength: number;
  tension: number;
};

export type LobbySnapshot = {
  roomId: string;
  lobbyId: string;
  createdAt: number;
  started: boolean;
  level: number;
  unlockedLevels: number;
  seed: number;
  tick: number;
  chain: ChainState;
  players: NetPlayer[];
};

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export const socket: Socket = io(serverUrl, {
  transports: ["websocket", "polling"],
  autoConnect: true,
});
