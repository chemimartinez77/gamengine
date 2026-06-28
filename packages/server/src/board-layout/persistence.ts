import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isValidGameId, type BoardLayout } from '@gamengine/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Board Layout — dev-only disk persistence
//
// Writes a layout JSON sidecar straight into the client package game folder:
//   packages/client/src/components/games/<gameId>/layout.json
// so Vite can hot-reload it during development. This module is the only place
// that touches the filesystem; the socket handler validates input first.
//
// Safety: `gameId` is validated against the shared whitelist (`^[a-z0-9-]+$`),
// which already excludes path separators and `..`. The resolved target path is
// additionally checked to stay strictly inside the games directory as
// defense-in-depth, and writes are atomic (temp file + rename).
// ─────────────────────────────────────────────────────────────────────────────

/** Relative path, from the monorepo root, to the client games directory. */
const CLIENT_GAMES_SEGMENTS = ['packages', 'client', 'src', 'components', 'games'] as const;
const LAYOUT_FILE_NAME = 'layout.json';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate the monorepo root by walking up from this module until a directory
 * containing `packages/client` is found, then return both the root and the
 * client games directory. Robust against the current working directory.
 */
async function resolveGamesDir(): Promise<{ repoRoot: string; gamesDir: string }> {
  let dir = path.dirname(fileURLToPath(import.meta.url));

  for (;;) {
    if (await pathExists(path.join(dir, 'packages', 'client'))) {
      return { repoRoot: dir, gamesDir: path.join(dir, ...CLIENT_GAMES_SEGMENTS) };
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('No se encontró la raíz del monorepo (packages/client).');
    }
    dir = parent;
  }
}

/**
 * Persist a board layout to `packages/client/src/components/games/<gameId>/layout.json`.
 * Returns the repo-relative path written (forward-slash normalized) for the ack.
 *
 * @throws if `gameId` is unsafe, the target escapes the games directory, or I/O fails.
 */
export async function saveBoardLayout(gameId: string, layout: BoardLayout): Promise<string> {
  // Defense-in-depth: the handler already validated, but never build a path from
  // an unvalidated slug.
  if (!isValidGameId(gameId)) {
    throw new Error(`Identificador de juego no permitido: "${gameId}".`);
  }

  const { repoRoot, gamesDir } = await resolveGamesDir();
  const targetDir = path.resolve(gamesDir, gameId);

  // Anti path-traversal: the resolved directory must be a direct, contained child.
  const rel = path.relative(gamesDir, targetDir);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('La ruta de destino queda fuera del directorio de juegos.');
  }

  await fs.mkdir(targetDir, { recursive: true });

  const filePath = path.join(targetDir, LAYOUT_FILE_NAME);
  const contents = JSON.stringify(layout, null, 2) + '\n';

  // Atomic write: write to a temp file, then rename over the target so a crash
  // mid-write can never leave a half-written layout.json behind.
  const tmpPath = path.join(targetDir, `.${LAYOUT_FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.writeFile(tmpPath, contents, 'utf8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }

  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}
