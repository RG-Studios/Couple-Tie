import { useEffect, useMemo, useRef } from "react";
import Phaser from "phaser";
import { CoopScene } from "./scenes/CoopScene";
import type { LobbySnapshot } from "../net/socket";
import { mobileInputBridge } from "../state/gameSession";

type Props = {
  lobby: LobbySnapshot;
  localPlayerId: string;
  chainStyle: "chain-heavy-steel" | "chain-neon-link" | "chain-heart-link" | null;
  onCoins: (amount: number) => void;
  onLevelUnlocked: (level: number) => void;
  onFunnyFail: (text: string) => void;
  onRescue: () => void;
};

const press = (partial: Partial<{ left: boolean; right: boolean; jump: boolean }>) => () => mobileInputBridge.set(partial);

const release = (partial: Partial<{ left: boolean; right: boolean; jump: boolean }>) => () => mobileInputBridge.set(partial);

export default function GameHost({ lobby, localPlayerId, chainStyle, onCoins, onLevelUnlocked, onFunnyFail, onRescue }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const initData = useMemo(
    () => ({
      lobbyId: lobby.lobbyId,
      localPlayerId,
      startLevel: lobby.level,
      players: lobby.players,
      chainStyle,
      onCoins,
      onLevelUnlocked,
      onFunnyFail,
      onRescue,
    }),
    [chainStyle, lobby.level, lobby.lobbyId, lobby.players, localPlayerId, onCoins, onFunnyFail, onLevelUnlocked, onRescue],
  );

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 1100,
      height: 760,
      backgroundColor: "#0a1120",
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 980, x: 0 },
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [CoopScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;
    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene("coop-scene");
      scene.scene.restart(initData);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [initData]);

  return (
    <div className="play-shell">
      <div className="phaser-wrapper" ref={containerRef} />
      <div className="mobile-controls">
        <button
          className="control-btn"
          onTouchStart={press({ left: true })}
          onTouchEnd={release({ left: false })}
          onMouseDown={press({ left: true })}
          onMouseUp={release({ left: false })}
        >
          LEFT
        </button>
        <button
          className="control-btn"
          onTouchStart={press({ right: true })}
          onTouchEnd={release({ right: false })}
          onMouseDown={press({ right: true })}
          onMouseUp={release({ right: false })}
        >
          RIGHT
        </button>
        <button className="control-btn jump" onTouchStart={press({ jump: true })} onMouseDown={press({ jump: true })}>
          JUMP
        </button>
      </div>
    </div>
  );
}
