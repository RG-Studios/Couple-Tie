import { useEffect, useMemo, useRef, useState } from "react";
import GameHost from "./game/GameHost";
import { socket, type LobbySnapshot } from "./net/socket";
import { progressStore } from "./state/gameSession";

type ViewState = "home" | "lobby" | "playing";

export default function App() {
  const [view, setView] = useState<ViewState>("home");
  const [joinId, setJoinId] = useState("");
  const [localPlayerId, setLocalPlayerId] = useState("");
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [error, setError] = useState("");
  const [progress] = useState(progressStore.get());

  const createButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    createButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onConnected = (payload: { socketId: string }) =>
      setLocalPlayerId(payload.socketId);

    const onCreated = (snapshot: LobbySnapshot) => {
      setLobby(snapshot);
      setView(snapshot.started ? "playing" : "lobby");
    };

    const onUpdated = (snapshot: LobbySnapshot) => {
      setLobby(snapshot);
      if (snapshot.started) setView("playing");
    };

    socket.on("connected", onConnected);
    socket.on("room_created", onCreated);
    socket.on("lobby:created", onCreated);
    socket.on("room_joined", onUpdated);
    socket.on("lobby:update", onUpdated);

    return () => {
      socket.off("connected", onConnected);
      socket.off("room_created", onCreated);
      socket.off("lobby:created", onCreated);
      socket.off("room_joined", onUpdated);
      socket.off("lobby:update", onUpdated);
    };
  }, []);

  const createLobby = () => {
    setError("");
    socket.emit("create_room");
  };

  const joinLobby = () => {
    setError("");
    socket.emit("join_room", {
      roomId: joinId.trim().toUpperCase(),
    });
  };

  const localCoins = useMemo(() => {
    if (!lobby || !localPlayerId) return progress.coins;
    return progress.coins;
  }, [lobby, localPlayerId, progress.coins]);

  if (view === "playing" && lobby) {
    return (
      <GameHost
        lobby={lobby}
        localPlayerId={localPlayerId}
        chainStyle="chain-heavy-steel"
        onCoins={() => {}}
        onLevelUnlocked={() => {}}
        onFunnyFail={() => {}}
        onRescue={() => {}}
      />
    );
  }

  return (
    <main className="game-menu">
      <div className="menu-background" />

      <div className="floating-particles" />

      <section className="hero-section">
        <div className="logo-block">
          <h1>COUPLE TIE</h1>
          <p>
            Two players. One chain. Zero excuses.
          </p>
        </div>

        <div className="chain-showcase">
          <div className="player player-left">🧑</div>

          <div className="chain-line">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className="player player-right">👧</div>
        </div>

        <div className="menu-panel">
          <button
            ref={createButtonRef}
            className="game-btn primary"
            onClick={createLobby}
          >
            CREATE LOBBY
          </button>

          <div className="join-row">
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="ENTER LOBBY CODE"
            />

            <button
              className="game-btn secondary"
              onClick={joinLobby}
            >
              JOIN
            </button>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <span>COINS</span>
              <strong>{localCoins}</strong>
            </div>

            <div className="stat-card">
              <span>LEVEL</span>
              <strong>{progress.unlockedLevel}</strong>
            </div>

            <div className="stat-card">
              <span>STATUS</span>
              <strong>
                {localPlayerId ? "ONLINE" : "CONNECTING"}
              </strong>
            </div>
          </div>

          {error && (
            <div className="error-box">{error}</div>
          )}
        </div>
      </section>
    </main>
  );
}