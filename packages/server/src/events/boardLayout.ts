import type { TypedSocket } from '../socket.types.js';
import {
  isBoardLayoutSavePayload,
  type BoardLayoutSavePayload,
  type BoardLayoutSaveResult,
} from '@gamengine/shared';
import { saveBoardLayout } from '../board-layout/persistence.js';

// ─────────────────────────────────────────────────────────────────────────────
// `board:layout:save` — dev-only handler for the generic visual layout editor.
// Persists a dragged layout to the client game folder so Vite hot-reloads it.
// ─────────────────────────────────────────────────────────────────────────────

type SaveAck = (result: BoardLayoutSaveResult) => void;

async function handleSave(payload: BoardLayoutSavePayload, callback: SaveAck): Promise<void> {
  // 1. Dev-only guard: never let layout writes happen in production.
  if (process.env['NODE_ENV'] === 'production') {
    callback({ ok: false, error: 'El editor de maquetación solo está disponible en modo desarrollo.' });
    return;
  }

  // 2. Validate shape + sanitize gameId (anti path-traversal) via shared guards.
  if (!isBoardLayoutSavePayload(payload)) {
    callback({ ok: false, error: 'Datos de maquetación no válidos.' });
    return;
  }

  // 3. Persist safely; never let an I/O error crash the server process.
  try {
    const writtenPath = await saveBoardLayout(payload.gameId, payload.layout);
    callback({ ok: true, writtenPath });
  } catch (err) {
    console.error('[board:layout:save] Error al guardar la maquetación:', err);
    callback({ ok: false, error: 'No se pudo guardar la maquetación en el disco.' });
  }
}

/** Wire the `board:layout:save` listener onto a freshly connected socket. */
export function registerBoardLayoutHandlers(socket: TypedSocket): void {
  socket.on('board:layout:save', (payload, callback) => {
    void handleSave(payload, callback);
  });
}
