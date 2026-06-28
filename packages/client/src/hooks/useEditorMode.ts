import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardLayout, BoardLayoutSaveResult } from '@gamengine/shared'
import { useSocketContext } from '../context/SocketContext'

// ─────────────────────────────────────────────────────────────────────────────
// useEditorMode — generic dev-only layout-editor save controller.
//
// Encapsulates the cross-game concerns of the visual layout editor:
//   • detects editor mode from the `?edit=true` URL flag,
//   • emits the `board:layout:save` socket event and tracks the ack lifecycle,
//   • binds the global Ctrl+S / Cmd+S shortcut to trigger a save.
//
// It is intentionally game-agnostic: callers pass their `gameId` and a
// `buildLayout()` that serializes the *current* board placement into the shared
// `BoardLayout` contract at save time.
// ─────────────────────────────────────────────────────────────────────────────

export type LayoutSaveState = 'idle' | 'saving' | 'success' | 'error'

interface UseEditorModeOptions {
  /** Stable game slug sent in the payload (e.g. `'jaipur'`). */
  gameId: string
  /** Builds the current layout snapshot (shared contract) at the moment of saving. */
  buildLayout: () => BoardLayout
  /**
   * Optional override for whether the editor is active. Defaults to the
   * `?edit=true` URL flag. Games with their own toggle (e.g. a backtick key) can
   * forward it here so the toolbar and shortcut follow that master switch.
   */
  enabled?: boolean
}

export interface UseEditorModeResult {
  isEditing: boolean
  saveState: LayoutSaveState
  errorMessage: string | null
  lastWrittenPath: string | null
  /** Emit the current layout to the server for disk persistence. */
  save: () => void
}

/** How long a success badge lingers before the button returns to idle (ms). */
const SUCCESS_RESET_MS = 2500

function readEditFlag(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('edit') === 'true'
}

export function useEditorMode({
  gameId, buildLayout, enabled,
}: UseEditorModeOptions): UseEditorModeResult {
  const socket  = useSocketContext()
  const urlFlag = useMemo(readEditFlag, [])
  const isEditing = enabled ?? urlFlag

  const [saveState, setSaveState]             = useState<LayoutSaveState>('idle')
  const [errorMessage, setErrorMessage]       = useState<string | null>(null)
  const [lastWrittenPath, setLastWrittenPath] = useState<string | null>(null)

  // Keep the latest builder reachable from handlers without re-binding listeners.
  const buildRef = useRef(buildLayout)
  buildRef.current = buildLayout
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(() => {
    if (resetTimer.current) { clearTimeout(resetTimer.current); resetTimer.current = null }
    setSaveState('saving')
    setErrorMessage(null)

    socket.emit('board:layout:save', { gameId, layout: buildRef.current() },
      (result: BoardLayoutSaveResult) => {
        if (result.ok) {
          setSaveState('success')
          setLastWrittenPath(result.writtenPath ?? null)
          resetTimer.current = setTimeout(() => setSaveState('idle'), SUCCESS_RESET_MS)
        } else {
          setSaveState('error')
          setErrorMessage(result.error ?? 'No se pudo guardar la maquetación.')
        }
      },
    )
  }, [socket, gameId])

  // Ctrl+S / Cmd+S → save (only while the editor is active).
  useEffect(() => {
    if (!isEditing) return
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEditing, save])

  // Drop any pending success-reset timer on unmount.
  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current) }, [])

  return { isEditing, saveState, errorMessage, lastWrittenPath, save }
}
