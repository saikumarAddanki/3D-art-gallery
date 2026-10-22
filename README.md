# Our Museum

Multiplayer 3D photo museum (Three.js + Node/WebSocket). Up to 4 people walk it together.

## Run
    npm install
    npm start          # http://localhost:3000
Create a museum, share the 6-letter code / invite link. Phones: open the same link (joystick appears on touch).

## Controls
WASD/arrows (Shift = run) or joystick · drag = look · wheel/pinch = zoom · E / ↑ button = interact · Enter = chat
Near a frame: "Add photo / Edit frame" (pick several photos to auto-fill following frames).
Near a friend: Hug / Kiss.  Cinema (back hall): Play film, Save as video (.webm), or upload your own video.

## Deploy
Needs a Node host with WebSocket support (Render, Railway, Fly, VPS). Uploads/rooms are stored in ./data (use a persistent disk).

## Persistent storage (so nothing is lost on restart)
Free hosts wipe local disks. Set these env vars and photos + museums are stored in Supabase instead:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=<service_role key>      # keep secret, server-side only
    SUPABASE_BUCKET=museum                       # optional, auto-created as public
