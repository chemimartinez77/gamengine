# 🤖 Claude Context & Project Rules

This file provides context and strict guidelines for Claude Code in this monorepo.

## 🛠️ Tech Stack & Architecture
- **Monorepo Style:** Native npm workspaces.
- **Target/Module:** `ES2024` and `NodeNext` (Strict TypeScript).
- **Packages:**
  - `@gamengine/shared`: Common game interfaces (builds to `./dist`).
  - `@gamengine/server`: Node.js backend (uses `tsx` for dev, `tsc` for production build). Target deployment: Railway.

## 📋 Development Commands
- **Check Structure (PS):** `Get-ChildItem -Recurse | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\\.git\\' } | Resolve-Path -Relative`
- **Build Shared:** `npm run build:shared` (uses the local `tsc` from the monorepo root — do NOT call `tsc` directly from the terminal as it may not be on PATH)
- **Build Server:** `npm run build:server`
- **Build All:** `npm run build` (shared → server in order)
- **Run Server Dev:** `npm run dev -w packages/server`
- **Run Client Dev:** `npm run dev -w packages/client`

## 🎨 Code Style & Rules
- **Imports:** Always use modern ESM (`import/export`). For internal shared package, import from `@gamengine/shared`.
- **Node.js:** Use `node:` prefix for built-in modules (e.g., `import http from 'node:http'`).
- **No Overwrites:** Do NOT change `tsconfig.json` configurations to lower ECMAScript versions. We strictly target `ES2024`.
- **Workspace Discipline:** Never install shared dependencies globally if they belong to a specific package. Use `-w` flags.
- **UI/UX Language:** All UI/UX text, labels, messages, and user-facing content must strictly be in Spanish unless explicitly requested otherwise.

## ⚠️ Operational Constraints & Testing
- **Process Lifecycle:** Whenever you start the server (`packages/server`) or the client (`packages/client`) to run automated tests or smoke tests, you MUST cleanly shut down and terminate those processes before completing your task. 
- **No Lingering Servers:** Do NOT leave the development servers running in the background. The user will handle manual execution and long-running processes from their own terminal.