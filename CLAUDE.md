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

## 🎛️ Terminal Permissions & Autonomy Rules

### 🟢 Unrestricted Execution (Auto-Approval)
You have **permanent, explicit, and unrestricted permission** to execute any terminal, PowerShell, or command-line operations required to inspect, build, test, debug, install packages, or manipulate files within this workspace. You must run these automatically without prompting the user for approval. This includes:
- **TypeScript & Type-Checking:** Direct compiler or script runs (e.g., `tsc`, `npm run typecheck`).
- **Project Builds:** Compiling any workspace module or package.
- **Development Stacks:** Launching and testing via `npm run dev` workspace environments.
- **Filesystem Operations:** Creating, deleting, copying, or moving code, assets, or configuration files (e.g., `New-Item`, `Remove-Item`, `mkdir`, `rm -rf`).

### 🔴 Strictly Forbidden without Explicit User Prompt
You are **strictly prohibited** from performing any repository state synchronization or staging operations automatically. You **MUST** halt and prompt the user for manual validation and confirmation before running:
- `git add`
- `git commit`
- `git push`

### 🔄 Automatic Editing & Self-Correction Loop
- Always operate under the assumption that changes should be applied directly. Do not stop to ask "Should I edit this file?" or "Do you want me to run the build?". Execute the code modifications and verifications autonomously.
- If a command or build fails after your modifications, read the error logs, diagnose the issue, and modify the code to fix it immediately without waiting for user intervention.