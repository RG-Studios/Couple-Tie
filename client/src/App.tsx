import { useEffect, useMemo, useRef, useState } from "react";
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

  const createButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    createButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    document.body.style.overflow = view === "playing" ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [view]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (view !== "home") return;

      if (e.key === "Enter") {
        if (joinId.trim()) {
          joinLobby();
        } else {
          createLobby();
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [joinId, view]);

  useEffect(() => {
    const onConnected = (payload: { socketId: string }) =>
      setLocalPlayerId(payload.socketId);

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
      setToast("Partner connected. Starting game.");
    };

    const onError = (payload: { message: string }) =>
      setError(payload.message);

    const onTeammateLeft = () => {
      setToast("Partner disconnected.");
      setLobby(null);
      setView("home");
    };

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
    };
  }, []);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const localCoinsInLobby = useMemo(() => {
    if (!lobby || !localPlayerId) return 0;

    return lobby.players.find((p) => p.id === localPlayerId)?.coins ?? 0;
  }, [lobby, localPlayerId]);

  const createLobby = () => {
    setError("");
    socket.emit("create_room");
  };

  const joinLobby = () => {
    setError("");
    socket.emit("join_room", {
      roomId: joinId.toUpperCase().trim(),
    });
  };

  const buy = (itemId: string) => {
    const result = progressStore.buy(itemId);

    if (!result.ok) {
      setToast("Not enough coins.");
      return;
    }

    setProgress(result.data);
  };

  const equip = (itemId: string) => {
    setProgress(progressStore.equip(itemId));
  };

  const addCoins = (amount: number) => {
    setProgress(progressStore.addCoins(amount));
  };

  const unlockLevel = (level: number) => {
    setProgress(progressStore.unlockLevel(level));
  };

  return (
    <main className={`app-root ${view === "playing" ? "playing-mode" : ""}`}>
      <div className="ambient-grid" />

      <section
        className={`card-shell ${
          view === "playing" ? "card-shell--playing" : ""
        }`}
      >
        <header className="hero-header">
          <div>
            <h1>COUPLE TIE</h1>
            <p className="subtitle">
              Survive together. Move together. Win together.
            </p>
          </div>

          {view !== "playing" && (
            <button
              className="store-toggle"
              onClick={() => setShowStore((v) => !v)}
            >
              {showStore ? "Close Store" : "Store"}
            </button>
          )}
        </header>

        {view !== "playing" && (
          <div className="meta-row">
            <span>Coins: {progress.coins + localCoinsInLobby}</span>
            <span>Level: {progress.unlockedLevel}</span>
            <span>
              {localPlayerId ? "Connected" : "Connecting..."}
            </span>
          </div>
        )}

        {view === "home" && (
          <section className="home-panel">
            <h2>Online Cooperative Adventure</h2>

            <p>
              Create a lobby and invite your partner. Both players are linked
              together and must solve every challenge as a team.
            </p>

            <div className="home-actions">
              <button
                ref={createButtonRef}
                className="primary-btn"
                onClick={createLobby}
              >
                Create Lobby
              </button>

              <div className="join-box">
                <input
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                  placeholder="Lobby ID"
                  maxLength={6}
                />

                <button
                  className="secondary-btn"
                  onClick={joinLobby}
                >
                  Join Lobby
                </button>
              </div>
            </div>

            <div className="keyboard-tip">
              Press ENTER to create/join quickly
            </div>
          </section>
        )}

        {view === "lobby" && lobby && (
          <section className="home-panel">
            <h2>Lobby {lobby.lobbyId}</h2>

            <p>
              Players Connected: {lobby.players.length}/2
            </p>

            <div className="waiting-box">
              Waiting for your partner...
            </div>
          </section>
        )}

        {view === "playing" && lobby && (
          <GameHost
            lobby={lobby}
            localPlayerId={localPlayerId}
            chainStyle={
              (progress.equipped.chain as
                | "chain-heavy-steel"
                | "chain-neon-link"
                | "chain-heart-link"
                | null) ?? "chain-heavy-steel"
            }
            onCoins={addCoins}
            onLevelUnlocked={unlockLevel}
            onFunnyFail={(text) => setToast(text)}
            onRescue={() => setToast("Rescue successful")}
          />
        )}

        {showStore && (
          <aside className="store-panel">
            <h3>Store</h3>

            {storeCatalog.map((item) => {
              const owned =
                progress.purchased.includes(item.id) ||
                item.id === "chain-heavy-steel";

              const equipped =
                progress.equipped[item.type] === item.id;

              return (
                <article key={item.id} className="store-item">
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.type.toUpperCase()} • {item.cost} Coins
                    </p>
                  </div>

                  <div className="store-actions">
                    {!owned && (
                      <button onClick={() => buy(item.id)}>
                        Buy
                      </button>
                    )}

                    {owned && !equipped && (
                      <button onClick={() => equip(item.id)}>
                        Equip
                      </button>
                    )}

                    {equipped && <span>Equipped</span>}
                  </div>
                </article>
              );
            })}
          </aside>
        )}

        {error && <div className="error-line">{error}</div>}
        {toast && <div className="toast">{toast}</div>}
      </section>
    </main>
  );
}