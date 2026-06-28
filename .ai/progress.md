# Work Plan — Generic Visual Layout Editor System (Board Layout Tool)

> **Status:** Initial Planning (No source code written yet).
> **Planner:** Atomic breakdown for Shared, Server, and Client agents.
> **Strict Execution Order:** `Shared → Server → Client` (contracts before logic; backend logic before UI)[cite: 1].

---

## 1. Requirements

Create a **generic visual layout editing system** within the Board Engine that allows, **exclusively in development mode**:

1. Dragging/adjusting visual anchors of game pieces directly over the board image on the client side.
2. Sending the new coordinates `(x, y)` as a **JSON** payload to the server via WebSockets[cite: 1].
3. Having the server **persist that JSON to the local development disk**[cite: 1], replacing the current manual copy-paste workflow from the browser console into `boardLayout.ts`[cite: 1].

The system must be **reusable by any game** (Jaipur being the first consumer), rather than hardcoded to a specific title.

---

## 2. Current State (Findings)

- **Existing Editor Coupled to Jaipur:** All layout editing logic lives inside `packages/client/src/components/games/jaipur/JaipurBoard.tsx` (editor block, lines ~77–218). It currently persists to `localStorage` (`jaipur-board-layout`) and outputs a `console.log` for manual copy-pasting.
- **Data Contract in Client:** `Anchor`, `BoardLayout`, `createBoardLayout()`, and `useBoardSize()` currently live in `packages/client/src/components/games/jaipur/boardLayout.ts`. To generalize this, the **data contracts (types)** must originate in `packages/shared`[cite: 1].
- **Pure Socket.io Server:** `packages/server/src/index.ts` bootstraps `http.createServer()` + Socket.io[cite: 1]. **There is no Express and no REST routing.**[cite: 1] => Persistence must be handled via a **socket event**, not an HTTP POST[cite: 1].
- **Centralized Event Typing:** `packages/server/src/socket.types.ts` defines `ClientToServerEvents` / `ServerToClientEvents`. The new event must be declared there, and its payload should ideally be defined in `shared`[cite: 5].
- **Socket Handlers:** Registered inside `packages/server/src/events/` (`index.ts`, `handlers.ts`).

---

## 3. Architectural Decisions & Confirmed Assumptions

1. **Transport = Socket.io Event** (`board:layout:save`), not REST[cite: 1]. Fits the current architecture seamlessly without introducing Express[cite: 1].
2. **Persistence Format = JSON sidecar**, instead of rewriting `.ts` source files[cite: 1]. The server writes a `layout.json` file inside the corresponding game folder. In dev mode, `boardLayout.ts` will merge this JSON data over the default parameters[cite: 1]. This avoids fragile source-code manipulation[cite: 1].
3. **JSON Location:** Saved directly inside `packages/client/src/components/games/<game>/`[cite: 1]. This allows Vite to natively import it during development (`import layoutData from './layout.json'`), triggering instant Hot-Reloading upon saving[cite: 1].
4. **Dev-Only Guard:** The save socket handler will automatically reject incoming payloads if `process.env.NODE_ENV === 'production'`. On the client side, the editor UI elements only appear in development mode.
5. **Path Security:** The server validates the incoming `gameId` against a strict whitelist/regex (`^[a-z0-9-]+$`) and resolves the target path absolutely to prevent *path traversal* attacks (`..`, unauthorized directory stepping).
6. **Game Identifier (`gameId`):** Assumes a stable slug per game (e.g., `"jaipur"`). The client sends this within the payload.
7. **UI Language:** Any new editor UI elements (buttons, tooltips) will display text in **Spanish** as per project localization preferences.

---

## 4. Phase 1 — Shared Agent (`packages/shared`)

> **Goal:** Turn the layout contract into the shared source of truth and define the socket event schemas[cite: 1]. No Node `fs`/`path` modules, no React/DOM APIs[cite: 2].

- [X] **S1.** Create a generic layout contract module — done in `packages/shared/src/board-layout/index.ts`:
  - `Anchor` (`topPct`, `leftPct`), plus `LayoutItemKind` + `BoardLayoutItem` (id/kind/anchor) for the editor-facing item view (covers planner step "layout item: id, type, x/y").
  - `BoardLayout` = scalar knobs (`cardWPct`, `tokenWPct`, `tokenStackOffset`) + generic `anchors: Record<string, Anchor | Anchor[]>`.
- [X] **S2.** Save payload contract: `BoardLayoutSavePayload = { gameId: string, layout: BoardLayout }`.
- [X] **S3.** Ack contract: `BoardLayoutSaveResult = { ok: boolean, writtenPath?: string, error?: string }`. **Note:** used `ok` (not `success`) to match the repo's existing socket-callback convention (`send_move`, `join_room`).
- [X] **S4.** Runtime validation: **pure-TS type guards** instead of Zod. Zod is not a dependency and adding it would require editing `package.json` + installing (outside this phase's `src/` scope) and break the package's zero-dep / Node-free style. Exported `isBoardLayoutSavePayload`, `isBoardLayout`, `isAnchor`, `isValidGameId`, `GAME_ID_PATTERN`, `GAME_ID_MAX_LENGTH`. _(If Zod is preferred, flag it — it's a one-line dep add the Server phase can request.)_
- [X] **S5.** Exported all of the above from the package barrel `packages/shared/index.ts`, and declared the `board:layout:save` event in `ClientToServerEvents` (the canonical event map lives in the shared barrel; the server's `socket.types.ts` only re-exports it).
- [X] **S6.** `npm run build:shared` compiles cleanly, zero type errors; `dist/src/board-layout/` and barrel re-exports verified.

**Phase 1 Acceptance Criteria:** Both server and client packages can import `BoardLayout`, the socket payloads, and the validation schemas from `@gamengine/shared`[cite: 1]. No node-specific or DOM-specific code leaks into shared[cite: 1, 2].

---

## 5. Phase 2 — Server Agent (`packages/server`)

> **Goal:** Receive the layout JSON payload via WebSockets and safely persist it to the local development disk[cite: 1]. All data contracts must come from `shared`[cite: 5].

- [X] **SV1.** Event already declared in the shared barrel (Phase 1); the server's `socket.types.ts` re-exports it unchanged. The handler consumes `BoardLayoutSavePayload` / `BoardLayoutSaveResult` from `@gamengine/shared`.
- [X] **SV2.** Handler implemented in `packages/server/src/events/boardLayout.ts` (`registerBoardLayoutHandlers`), wired into the socket lifecycle from `events/handlers.ts → registerHandlers`. (`events/index.ts` only re-exports `registerHandlers`, so registration is plugged in there.)
  - **Dev-only guard:** rejects with a Spanish error ack when `process.env.NODE_ENV === 'production'`.
  - **Validation:** uses `isBoardLayoutSavePayload` (shared **type-guards**, not Zod — see Phase 1 S4 note).
- [X] **SV3.** Persistence module `packages/server/src/board-layout/persistence.ts`:
  - `gameId` re-validated via `isValidGameId` before building any path.
  - Resolves the monorepo root by walking up from `import.meta.url` (cwd-independent); target = `packages/client/src/components/games/<gameId>/layout.json`. Verifies the resolved dir stays inside the games dir (anti-traversal, defense-in-depth).
  - `node:fs/promises` + `node:path`; `mkdir({ recursive: true })`; **atomic write** (temp file + `rename`).
- [X] **SV4.** Ack returns `{ ok: true, writtenPath }` (repo-relative, forward-slash) or `{ ok: false, error }` with a Spanish message.
- [X] **SV5.** All I/O wrapped in try/catch; failures are logged and returned as a clean error ack — the server process never throws.
- [X] **SV6.** `npm run build:server` compiles cleanly. Smoke-tested against the built output: happy path wrote the file to the exact target path; `../evil`, `a/b`, `UPPER`, `..` all rejected. Test artifacts removed (no client files touched).

**Phase 2 Acceptance Criteria:** ✅ Met — verified by smoke test (valid payload writes/updates `layout.json`; traversal/invalid slugs blocked; prod guard returns a clean rejection ack).

---

## 6. Phase 3 — Client Agent (`packages/client`)

> **Goal:** Abstract the editing capabilities into a reusable React hook and swap console logging for real-time socket persistence[cite: 1].

> **Slice delivered this iteration:** the server-save mechanism — `useEditorMode` hook + floating toolbar + `board:layout:save` emit (essentially **C4**). The broader generic extraction (C1/C2/C3/C5/C6) remains queued.

- [X] **C1.** Generalized the shared `BoardLayout` contract to be fully game-agnostic: `{ scales: Record<string, number>; anchors: Record<string, Anchor | Anchor[]> }` (removed the Jaipur-ish `cardWPct`/`tokenWPct`/`tokenStackOffset` from the contract; they're now just keys under `scales`). Updated `isBoardLayout` to validate the new shape. Server and client both consume the identical contract; integration-tested that the new shape is accepted and the legacy (no-`scales`) shape is rejected. _(`boardLayout.ts` keeps Jaipur's structured layout for rendering; `toSharedLayout`/`fromSharedLayout` bridge it to the shared contract.)_
- [X] **C2.** Extracted all generic editor mechanics into **`hooks/useBoardLayoutEditor.ts`** — `useBoardLayoutEditor<L>(...)`: editor toggle (`` ` `` / `?edit`), editable layout state + localStorage scratchpad, selection, pointer drag, arrow-key nudge, magnifier toggle, and keyboard controls (Esc / R / `+`-`-` / `u`-`d` / plain `S`). Generic over the game's layout type `L` via thin adapters (`getAnchor`/`setAnchor`/`scaleSelected`/`adjustStackOffset`/`onExport`). `JaipurBoard` now consumes it and supplies Jaipur adapters (`getAnchor`/`updateAnchor`/`scaleJaipurElement`/export).
- [X] **C3.** Migrated the visual primitives to **`components/board/`** as pure, reusable, prop-driven components: `Zone` (+ `ZoneEditor` type), `TokenStack` (now takes pre-rendered `items`), `StructuralMarker`, `MagnifierLens` (new generic loupe taking image+ratio), plus the existing `LayoutEditorToolbar`, all re-exported from `components/board/index.ts`. Removed the in-file copies from Jaipur.
- [X] **C4.** Replaced the save path: new **`useEditorMode`** hook (`hooks/useEditorMode.ts`) emits `board:layout:save` and tracks the ack lifecycle (`idle/saving/success/error`); new **`LayoutEditorToolbar`** (`components/board/LayoutEditorToolbar.tsx`) is a floating overlay with a "Guardar Layout" button (loading/success states), a `Ctrl/⌘+S` hint, and Spanish error display. Wired into `JaipurBoard` (`gameId='jaipur'`, `toSharedLayout()` builds the shared payload). Legacy plain-`S` console export retained but now ignores Ctrl/⌘ so the two shortcuts don't collide.
- [X] **C5.** Closed the ingest loop: `JaipurBoard.tsx` now `import localLayout from './layout.json'` (the server-written sidecar). `fromSharedLayout()` rebuilds the structured layout from the generic `anchors` dict (deep-merging over factory defaults for resilience); `loadLayout()` uses the file as baseline with `localStorage` layered on top as the editing scratchpad. A `useEffect` keyed on the imported module re-hydrates from the file on Vite HMR (skipping the first mount so it never clobbers the scratchpad). Added `resolveJsonModule` to the client tsconfig; created the initial `layout.json` (= factory defaults). `tsc --noEmit` and `vite build` both pass.
- [X] **C6.** `JaipurBoard.tsx` refactored onto the abstracted hook + generic components without altering any gameplay state (only the editor/render plumbing changed). File slimmed 855 → 781 lines, with ~240 lines of reusable editor mechanics moved into the shared hook + `components/board/` primitives. `tsc --noEmit`, `vite build`, and `build:server` all pass.
- [~] **C7.** Save→persist→re-ingest loop wired and build-verified; HMR path implemented. **Live browser confirmation by the user still pending** (run `npm run dev` for server+client, open `?edit=true`, drag → Ctrl+S → verify `layout.json` changes and the board reflects it on reload / live HMR).

**Phase 3 Acceptance Criteria:** ✅ Generic decoupling delivered (C1 shared contract, C2 `useBoardLayoutEditor`, C3 `components/board/` primitives). Save-to-server mechanism (C4) + sidecar ingest/HMR (C5) in place and integration-tested. Only live in-browser confirmation (C7) remains, owned by the user.

**Tooling note:** `Tailwind CSS` is **not** configured in `packages/client` (no config/PostCSS/deps; the whole client styles with inline `style` objects). The floating toolbar follows that established inline-style convention instead of Tailwind utility classes.

---

## 7. Global Integration & Validation

- [ ] **V1.** Execute a full monorepo build command (`npm run build`) ensuring seamless end-to-end typing coherence.
- [ ] **V2.** Run a complete manual smoke test: edit an anchor -> save -> verify file system file creation -> trigger page reload.
- [ ] **V3.** Confirm that layout storage channels are completely inert and blocked when running under simulated production environments.
- [ ] **V4.** Ensure all dev environments close down with clean network port cycles when terminating testing routines.