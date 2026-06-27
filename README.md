# VC App — WebRTC Learning Project

This is a simple Omegle-like WebRTC learning project. It uses basic WebRTC APIs to establish a peer-to-peer connection between two users and Cloud Firestore as a minimal signaling & matchmaking backend.

Purpose and scope
- Educational: built for learning WebRTC fundamentals (offer/answer, ICE candidates, data channels).
- Signaling: Firestore is used as a lightweight signaling and matchmaking layer.
- Not production-ready: a full Omegle-style product requires additional server-side infrastructure for moderation, monitoring, IP tracking, abuse prevention, and legal compliance — these are intentionally left out for this learning project.

Features
- Simple P2P video between two peers.
- Firestore-based signaling and matchmaking using a `connections` collection.
- Live local preview on app load.
- Start / Disconnect controls and basic UI placeholders.
- Basic error handling with a modal and automatic cleanup on failures.

Quick start
1. Install deps:

```bash
npm install
```

2. Add your Firebase keys to `.env` (the repo includes a sample `.env` using Vite-style `VITE_` prefixes).

3. Run dev server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

Notes
- Environment variables are read via `import.meta.env` (Vite). Keep your `.env` local — it is ignored by `.gitignore`.
- The Firestore collection name used for signaling is `connections` by default and can be changed with `VITE_FIREBASE_DB_COLLECTION`.
- Error handling is basic: when a critical error occurs the app frees local resources and shows a modal allowing the user to reset and retry.
- Anonymous sign-in must be enabled in Firebase Authentication -> Sign-in method. If it is disabled, the app will receive a 400 from `accounts:signUp` even if the API key is valid.

Security and privacy
- This project stores ephemeral offers/answers and ICE candidates in Firestore for learning only. Do not use this implementation as-is for production: add proper auth, moderation, rate-limiting and data retention policies.
- The app now uses anonymous Firebase Auth and the repo includes a minimal Firestore rules file to block unauthenticated access and keep payloads small enough for a learning project.
- The goal here is basic abuse prevention, not strong production security: authenticated users can still be misused if the app is shared publicly.

Minimal abuse prevention
- Enable anonymous authentication in Firebase Authentication.
- Deploy the included `firestore.rules` file so only signed-in users can read/write the signaling data.
- Keep room and ICE candidate payloads small; the rules cap offer/answer strings and candidate fields to modest sizes.
- Room cleanup is owner-driven: the caller who created the room can delete the room doc plus both ICE candidate collections on disconnect.
- If you later add real moderation or anti-abuse controls, move signaling to a server and add auth, logging, and cleanup policies there.


This project began as a JavaScript-only learning challenge with the goal of understanding WebRTC fundamentals without relying on tutorials. The initial implementation focused on peer connection setup, SDP offer/answer exchange, ICE candidate propagation, and Firestore-based signaling.

After the prototype successfully established peer-to-peer video connections, the project was refactored to TypeScript and received a redesigned user interface, anonymous Firebase authentication, improved error handling, and basic security rules.