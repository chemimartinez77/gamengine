# Multi-Agent Workflow

Developing any feature or game within this monorepo must strictly adhere to the following sequential agent order to avoid context collisions and code regressions:

1. **Planner**: Analyzes requirements and generates or updates the `.ai/progress.md` file. Forbidden from writing or changing source code.
2. **Game Designer**: Models static game data (JSON/YAML) if the task requires content definitions.
3. **Shared Agent**: Creates or updates TypeScript interfaces, types, and DTOs exclusively inside `packages/shared`.
4. **Server Agent**: Implements backend logic, socket event handlers, and dev-time persistence inside `packages/server`.
5. **Client Agent**: Develops React components, PixiJS view containers, and UI interactions inside `packages/client`.
6. **QA Agent**: Validates implementation correctness using unit tests, integration tests, or simulation scripts.

## Context Boundary Law
No technical agent may modify files outside its designated package scope (`packages/[scope]`). If the Client Agent requires a data contract mutation, it must pause execution and request the Shared Agent to act first.