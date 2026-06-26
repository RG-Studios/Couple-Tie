import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import GameHost from "./game/GameHost";
import { socket } from "./net/socket";
import { progressStore, storeCatalog } from "./state/gameSession";
export default function App() {
    const [view, setView] = useState("home");
    const [joinId, setJoinId] = useState("");
    const [localPlayerId, setLocalPlayerId] = useState("");
    const [lobby, setLobby] = useState(null);
    const [error, setError] = useState("");
    const [toast, setToast] = useState("");
    const [showStore, setShowStore] = useState(false);
    const [progress, setProgress] = useState(progressStore.get());
    useEffect(() => {
        const onConnected = (payload) => setLocalPlayerId(payload.socketId);
        const onCreated = (snapshot) => {
            setLobby(snapshot);
            setView(snapshot.started ? "playing" : "lobby");
            setError("");
        };
        const onUpdated = (snapshot) => {
            setLobby(snapshot);
            if (snapshot.started) {
                setView("playing");
            }
        };
        const onStart = (snapshot) => {
            setLobby(snapshot);
            setView("playing");
            setToast("Both players connected. Chain engaged.");
        };
        const onError = (payload) => setError(payload.message);
        const onTeammateLeft = () => {
            setToast("Teammate disconnected. Return to menu.");
            setView("home");
            setLobby(null);
        };
        const onGameStateUpdate = (snapshot) => setLobby(snapshot);
        socket.on("connected", onConnected);
        socket.on("room_created", onCreated);
        socket.on("room_joined", onUpdated);
        socket.on("lobby:created", onCreated);
        socket.on("lobby:update", onUpdated);
        socket.on("start_game", onStart);
        socket.on("game:start", onStart);
        socket.on("room_error", onError);
        socket.on("lobby:error", onError);
        socket.on("player_disconnected", onTeammateLeft);
        socket.on("game:teammate-left", onTeammateLeft);
        socket.on("game_state_update", onGameStateUpdate);
        return () => {
            socket.off("connected", onConnected);
            socket.off("room_created", onCreated);
            socket.off("room_joined", onUpdated);
            socket.off("lobby:created", onCreated);
            socket.off("lobby:update", onUpdated);
            socket.off("start_game", onStart);
            socket.off("game:start", onStart);
            socket.off("room_error", onError);
            socket.off("lobby:error", onError);
            socket.off("player_disconnected", onTeammateLeft);
            socket.off("game:teammate-left", onTeammateLeft);
            socket.off("game_state_update", onGameStateUpdate);
        };
    }, []);
    useEffect(() => {
        if (!toast) {
            return;
        }
        const id = setTimeout(() => setToast(""), 2000);
        return () => clearTimeout(id);
    }, [toast]);
    const localCoinsInLobby = useMemo(() => {
        if (!lobby || !localPlayerId) {
            return 0;
        }
        return lobby.players.find((p) => p.id === localPlayerId)?.coins ?? 0;
    }, [lobby, localPlayerId]);
    const createLobby = () => {
        setError("");
        socket.emit("create_room");
    };
    const joinLobby = () => {
        setError("");
        socket.emit("join_room", { roomId: joinId.toUpperCase().trim() });
    };
    const buy = (itemId) => {
        const result = progressStore.buy(itemId);
        if (!result.ok) {
            setToast("Not enough coins yet.");
            return;
        }
        setProgress(result.data);
    };
    const equip = (itemId) => {
        setProgress(progressStore.equip(itemId));
    };
    const addCoins = (amount) => {
        setProgress(progressStore.addCoins(amount));
    };
    const unlockLevel = (level) => {
        setProgress(progressStore.unlockLevel(level));
    };
    return (_jsxs("main", { className: "app-root", children: [_jsx("section", { className: "ambient-grid" }), _jsxs("section", { className: "card-shell", children: [_jsxs("header", { className: "top-row", children: [_jsx("h1", { children: "CoupleTie" }), _jsx("button", { className: "store-toggle", onClick: () => setShowStore((v) => !v), children: showStore ? "Close Store" : "Open Store" })] }), _jsxs("div", { className: "meta-row", children: [_jsxs("p", { children: ["Coins: ", progress.coins + localCoinsInLobby] }), _jsxs("p", { children: ["Unlocked Level: ", progress.unlockedLevel] }), lobby ? _jsxs("p", { children: ["Lobby: ", lobby.lobbyId] }) : _jsxs("p", { children: ["Socket: ", localPlayerId ? "Connected" : "Connecting..."] })] }), view === "home" && (_jsxs("div", { className: "panel", children: [_jsx("h2", { children: "2-Player Online Co-op Only" }), _jsx("p", { children: "Create or join a lobby. The run starts automatically once both players connect." }), _jsxs("div", { className: "actions", children: [_jsx("button", { onClick: createLobby, children: "Create Lobby" }), _jsxs("div", { className: "join-box", children: [_jsx("input", { value: joinId, onChange: (e) => setJoinId(e.target.value), maxLength: 6, placeholder: "Lobby ID" }), _jsx("button", { onClick: joinLobby, children: "Join Lobby" })] })] })] })), view === "lobby" && lobby && (_jsxs("div", { className: "panel", children: [_jsxs("h2", { children: ["Lobby ", lobby.lobbyId] }), _jsxs("p", { children: ["Players connected: ", lobby.players.length, "/2. Waiting for your partner to connect so the chain can lock in."] })] })), view === "playing" && lobby && (_jsx(GameHost, { lobby: lobby, localPlayerId: localPlayerId, chainStyle: progress.equipped.chain ?? "chain-heavy-steel", onCoins: addCoins, onLevelUnlocked: unlockLevel, onFunnyFail: (text) => setToast(text), onRescue: () => setToast("Clutch rescue. Relationship saved.") })), showStore && (_jsxs("aside", { className: "store-panel", children: [_jsx("h3", { children: "Couple Store (Cosmetic Only)" }), storeCatalog.map((item) => {
                                const owned = progress.purchased.includes(item.id) || item.id === "chain-heavy-steel";
                                const equipped = progress.equipped[item.type] === item.id;
                                return (_jsxs("article", { className: "store-item", children: [_jsxs("div", { children: [_jsx("strong", { children: item.name }), _jsxs("p", { children: [item.type.toUpperCase(), " \u00B7 ", item.cost, " coins"] })] }), _jsxs("div", { className: "store-actions", children: [!owned && _jsx("button", { onClick: () => buy(item.id), children: "Buy" }), owned && !equipped && _jsx("button", { onClick: () => equip(item.id), children: "Equip" }), equipped && _jsx("span", { children: "Equipped" })] })] }, item.id));
                            })] })), error && _jsx("p", { className: "error-line", children: error }), toast && _jsx("p", { className: "toast", children: toast })] })] }));
}
