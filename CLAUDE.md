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

### Tool Usage & Permissions
* **PowerShell Auto-Approval:** You have explicit permission to execute the following categories of commands without asking for manual confirmation:
  * **TypeScript type-checking** — Direct TypeScript compiler invocations via node/tsc across ANY workspace packages (e.g., `node node_modules/typescript/bin/tsc` with flags like `--noEmit`, `-p packages/client/tsconfig.json`, `-p packages/server/tsconfig.json`) and `npm run typecheck` (or any workspace variant).
  * **Project builds and compilation** — `npm run build`, `npm run build:shared`, `npm run build:server`, `npm run build:client`, and any other `npm run build:*` script defined in the monorepo.
  * **Local development hot-reloading stacks** — `npm run dev`, `npm run dev -w packages/server`, `npm run dev -w packages/client`, and equivalent workspace-scoped dev commands.
  * **Testing and benchmarking scripts** — `npx tsx`, Vitest, or any internal one-shot script run via `npx tsx <file>`.
  * **Read-only workspace inspection** — `npm list`, `Get-ChildItem` (without `-Recurse` on large trees), `git status`, `git log`, `git diff`.
* **Explicit Permission Required:** You MUST still prompt for manual confirmation before executing any command that creates, copies, moves, or deletes files or directories on the filesystem (e.g., `Remove-Item`, `Copy-Item`, `Move-Item`, `New-Item`, `mkdir`, `rm -rf`).

## Execution & Autonomy Guidelines
- **Unrestricted Command Execution:** You have explicit, permanent, and unrestricted permission to execute any terminal commands required to implement, build, test, or debug the features discussed (e.g., `npm run build`, `npm dev`, linting, or package installations). Never prompt the user for permission before running a command.
- **Automatic Editing Mode:** Always operate under the assumption that changes should be applied directly. Do not stop to ask "Should I edit this file?" or "Do you want me to run the build?". Execute the code modifications and verifications autonomously.
- **Self-Correction Loop:** If a command or build fails after your modifications, read the error logs, diagnose the issue, and modify the code to fix it without waiting for user intervention.