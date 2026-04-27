import { io } from "socket.io-client";
const serverUrl = import.meta.env.VITE_SERVER_URL ?? "https://couple-tie.onrender.com";
export const socket = io(serverUrl, {
    transports: ["websocket", "polling"],
    autoConnect: true,
});
