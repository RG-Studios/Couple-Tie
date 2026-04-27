import { useEffect, useMemo, useState } from "react";
import GameHost from "./game/GameHost";
import { socket, type LobbySnapshot } from "./net/socket";
import { progressStore, storeCatalog } from "./state/gameSession";

type ViewState = "home" | "lobby" | "playing";

export default function App() {
  const [view, setView] = useState<ViewState>("home");
  const [joinId, setJoinId] = useState("");
  const [localPlayerId, setLocalPlayerId] = useState("");
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showStore, setShowStore] = useState(false);
  const [progress, setProgress] = useState(progressStore.get());

  useEffect(() => {
    const onConnected = (payload: { socketId: string }) => setLocalPlayerId(payload.socketId);
    const onCreated = (snapshot: LobbySnapshot) => {
      setLobby(snapshot);
      setView(snapshot.started ? "playing" : "lobby");
      setError("");
    };
    const onUpdated = (snapshot: LobbySnapshot) => {
      setLobby(snapshot);
      if (snapshot.started) {
        setView("playing");
      }
    };
    const onStart = (snapshot: LobbySnapshot) => {
      setLobby(snapshot);
      setView("playing");
      setToast("Both players connected. Chain engaged.");
    };
    const onError = (payload: { message: string }) => setError(payload.message);
    const onTeammateLeft = () => {
      setToast("Teammate disconnected. Return to menu.");
      setView("home");
      setLobby(null);
    };
    const onGameStateUpdate = (snapshot: LobbySnapshot) => setLobby(snapshot);

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

  const createLobby = (): void => {
    setError("");
    socket.emit("create_room");
  };

  const joinLobby = (): void => {
    setError("");
    socket.emit("join_room", { roomId: joinId.toUpperCase().trim() });
  };

  const buy = (itemId: string): void => {
    const result = progressStore.buy(itemId);
    if (!result.ok) {
      setToast("Not enough coins yet.");
      return;
    }
    setProgress(result.data);
  };

  const equip = (itemId: string): void => {
    setProgress(progressStore.equip(itemId));
  };

  const addCoins = (amount: number): void => {
    setProgress(progressStore.addCoins(amount));
  };

  const unlockLevel = (level: number): void => {
    setProgress(progressStore.unlockLevel(level));
  };

  return (
    <main className="app-root">
      <section className="ambient-grid" />
      <section className="card-shell">
        <header className="top-row">
          <h1>CoupleTie</h1>
          <button className="store-toggle" onClick={() => setShowStore((v) => !v)}>
            {showStore ? "Close Store" : "Open Store"}
          </button>
        </header>

        <div className="meta-row">
          <p>Coins: {progress.coins + localCoinsInLobby}</p>
          <p>Unlocked Level: {progress.unlockedLevel}</p>
          {lobby ? <p>Lobby: {lobby.lobbyId}</p> : <p>Socket: {localPlayerId ? "Connected" : "Connecting..."}</p>}
        </div>

        {view === "home" && (
          <div className="panel">
            <h2>2-Player Online Co-op Only</h2>
            <p>Create or join a lobby. The run starts automatically once both players connect.</p>
            <div className="actions">
              <button onClick={createLobby}>Create Lobby</button>
              <div className="join-box">
                <input value={joinId} onChange={(e) => setJoinId(e.target.value)} maxLength={6} placeholder="Lobby ID" />
                <button onClick={joinLobby}>Join Lobby</button>
              </div>
            </div>
          </div>
        )}

        {view === "lobby" && lobby && (
          <div className="panel">
            <h2>Lobby {lobby.lobbyId}</h2>
            <p>
              Players connected: {lobby.players.length}/2. Waiting for your partner to connect so the chain can lock in.
            </p>
          </div>
        )}

        {view === "playing" && lobby && (
          <GameHost
            lobby={lobby}
            localPlayerId={localPlayerId}
            chainStyle={(progress.equipped.chain as "chain-heavy-steel" | "chain-neon-link" | "chain-heart-link" | null) ?? "chain-heavy-steel"}
            onCoins={addCoins}
            onLevelUnlocked={unlockLevel}
            onFunnyFail={(text) => setToast(text)}
            onRescue={() => setToast("Clutch rescue. Relationship saved.")}
          />
        )}

        {showStore && (
          <aside className="store-panel">
            <h3>Couple Store (Cosmetic Only)</h3>
            {storeCatalog.map((item) => {
              const owned = progress.purchased.includes(item.id) || item.id === "chain-heavy-steel";
              const equipped = progress.equipped[item.type] === item.id;
              return (
                <article key={item.id} className="store-item">
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.type.toUpperCase()} · {item.cost} coins</p>
                  </div>
                  <div className="store-actions">
                    {!owned && <button onClick={() => buy(item.id)}>Buy</button>}
                    {owned && !equipped && <button onClick={() => equip(item.id)}>Equip</button>}
                    {equipped && <span>Equipped</span>}
                  </div>
                </article>
              );
            })}
          </aside>
        )}

        {error && <p className="error-line">{error}</p>}
        {toast && <p className="toast">{toast}</p>}
      </section>
    </main>
  );
}
