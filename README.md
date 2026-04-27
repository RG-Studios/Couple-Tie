# CoupleTie

Production-ready 2-player online co-op platformer built with React + TypeScript + Phaser on the client and Node + Express + Socket.IO on the server.

## Features

- Exactly 2 players per lobby (no solo mode)
- Create/Join lobby flow with auto-start when both players connect
- Permanent, unbreakable chain with max-length tension and slack behavior
- Progressive handcrafted levels with escalating hazard variety
- Static hazards: spikes, trap walls/ceilings style coverage
- Dynamic hazards: moving blades, rotating saws, swinging axes, crushers
- Projectile traps: cannons with timed shots
- Platform challenge systems: moving and disappearing platforms, narrow jumps, chain-constrained gaps
- Coin rewards + progression unlocks
- Cosmetic-only store (skins, chain styles, emotes, win animations)
- Touch controls for mobile + keyboard controls for desktop
- Client-side prediction + interpolation smoothing with periodic snapshots
- Funny fail feedback, rescue moment feedback, heart sync particles

## Project Structure

- `client/` React + Phaser game client
- `server/` Express + Socket.IO backend

## Tech Stack

- React 18 + TypeScript
- Phaser 3 (Arcade physics)
- Node.js + Express
- Socket.IO

## Local Development

### 1) Start Server

```powershell
Set-Location c:\Users\RG\Desktop\coupleTie\server
npm.cmd install
npm.cmd run dev
```

Server runs on `http://localhost:3001`.

### 2) Start Client

```powershell
Set-Location c:\Users\RG\Desktop\coupleTie\client
npm.cmd install
npm.cmd run dev
```

Client runs on `http://localhost:5173`.

Open two browser windows/devices, create a lobby in one, join it from the other, and the game starts automatically when both are connected.

## Production Build

### Server

```powershell
Set-Location c:\Users\RG\Desktop\coupleTie\server
npm.cmd run build
npm.cmd start
```

### Client

```powershell
Set-Location c:\Users\RG\Desktop\coupleTie\client
npm.cmd run build
npm.cmd run preview
```

## Controls

### Desktop

- Move: `A/D` (plus arrow keys fallback handling in scene)
- Jump: `Space` or `Up`

### Mobile

- Touch `LEFT`, `RIGHT`, `JUMP` overlay buttons

## Multiplayer Networking Model

- Lobby and room lifecycle on server
- Real-time `player:state` events for movement sync
- Periodic server snapshots (`state:snapshot`) for correction and interpolation
- Client-side local prediction for responsiveness
- Remote interpolation buffer to smooth latency/jitter

## Progression + Store

- Coins earned from level pickups and completion bonuses
- Unlock levels by progressing
- Store items are cosmetic only (no gameplay stats)
- Progress persisted in browser localStorage

## Notes About uv

This game stack is Node/TypeScript-based, so runtime dependencies are managed with npm. If you keep Python tooling in this repo and want uv-managed environments, you can use:

```powershell
Set-Location c:\Users\RG\Desktop\coupleTie
uv venv
uv pip install -r requirements.txt
```

For the game itself, use npm commands shown above.
