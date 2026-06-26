import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef } from "react";
import Phaser from "phaser";
import { CoopScene } from "./scenes/CoopScene";
import { mobileInputBridge } from "../state/gameSession";
const press = (partial) => () => mobileInputBridge.set(partial);
const release = (partial) => () => mobileInputBridge.set(partial);
export default function GameHost({ lobby, localPlayerId, chainStyle, onCoins, onLevelUnlocked, onFunnyFail, onRescue }) {
    const containerRef = useRef(null);
    const gameRef = useRef(null);
    const initData = useMemo(() => ({
        lobbyId: lobby.lobbyId,
        localPlayerId,
        startLevel: lobby.level,
        players: lobby.players,
        chainStyle,
        onCoins,
        onLevelUnlocked,
        onFunnyFail,
        onRescue,
    }), [chainStyle, lobby.level, lobby.lobbyId, lobby.players, localPlayerId, onCoins, onFunnyFail, onLevelUnlocked, onRescue]);
    useEffect(() => {
        if (!containerRef.current || gameRef.current) {
            return;
        }
        const config = {
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
    return (_jsxs("div", { className: "play-shell", children: [_jsx("div", { className: "phaser-wrapper", ref: containerRef }), _jsxs("div", { className: "mobile-controls", children: [_jsx("button", { className: "control-btn", onTouchStart: press({ left: true }), onTouchEnd: release({ left: false }), onMouseDown: press({ left: true }), onMouseUp: release({ left: false }), children: "LEFT" }), _jsx("button", { className: "control-btn", onTouchStart: press({ right: true }), onTouchEnd: release({ right: false }), onMouseDown: press({ right: true }), onMouseUp: release({ right: false }), children: "RIGHT" }), _jsx("button", { className: "control-btn jump", onTouchStart: press({ jump: true }), onMouseDown: press({ jump: true }), children: "JUMP" })] })] }));
}
