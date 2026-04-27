import Phaser from "phaser";
import { socket } from "../../net/socket";
export class DebugOverlay {
    constructor(scene) {
        this.scene = scene;
        this.ping = 0;
        this.logBudget = 0;
        this.onPong = (payload) => {
            this.ping = Math.max(0, Date.now() - payload.ts);
        };
        this.fpsText = scene.add
            .text(24, 74, "FPS: --", { fontFamily: "monospace", fontSize: "13px", color: "#e9ecef" })
            .setScrollFactor(0)
            .setDepth(20);
        this.pingText = scene.add
            .text(24, 92, "Ping: --", { fontFamily: "monospace", fontSize: "13px", color: "#e9ecef" })
            .setScrollFactor(0)
            .setDepth(20);
        this.syncText = scene.add
            .text(24, 110, "Sync: --", { fontFamily: "monospace", fontSize: "13px", color: "#e9ecef" })
            .setScrollFactor(0)
            .setDepth(20);
        socket.on("debug_pong", this.onPong);
        scene.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                socket.emit("debug_ping", { ts: Date.now() });
            },
        });
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            socket.off("debug_pong", this.onPong);
        });
    }
    update(syncError, pendingInputs) {
        this.fpsText.setText(`FPS: ${Math.round(this.scene.game.loop.actualFps)}`);
        this.pingText.setText(`Ping: ${this.ping}ms`);
        this.syncText.setText(`SyncErr: ${syncError.toFixed(1)} | Pending: ${pendingInputs}`);
        if (syncError > 80 && this.logBudget <= 0) {
            // eslint-disable-next-line no-console
            console.warn("[sync] high correction", { syncError, pendingInputs });
            this.logBudget = 30;
        }
        this.logBudget = Math.max(0, this.logBudget - 1);
    }
}
