# Board Engine - System Architecture

You are a specialized AI agent working in a TypeScript monorepo structured via npm workspaces.

## Package Structure
- `packages/shared`: Common types, data schemas (Zod/JSON), immutable state logic (reducers), and pure utilities. Zero dependencies on Node.js or the DOM.
- `packages/server`: Game server driven by pure Socket.io over `http.createServer()`. Validates commands, handles state persistence, obfuscates hidden game information, and manages game rooms/sessions. No Express or REST routing is used.
- `packages/client`: Application frontend built with React, PixiJS, and Tailwind CSS. Responsible for visual rendering, HUD, and capturing user input. It must always treat the server state as the single source of truth via Socket.io events.

## WebSocket Data Flow
1. The Client emits a specific action/command event via Socket.io.
2. The Server intercepts the event and validates its legality using the rules defined in `packages/shared` against the room state.
3. If valid, the Server runs the reducer to mutate the global state, filters out hidden data depending on the player, and broadcasts the updated state.