import {
  useCallback, useEffect, useRef, useState,
  type Dispatch, type PointerEvent, type RefObject, type SetStateAction,
} from 'react'
import type { Anchor } from '@gamengine/shared'
import type { ZoneEditor } from '../components/board/Zone'

// ─────────────────────────────────────────────────────────────────────────────
// useBoardLayoutEditor — generic visual layout-editor mechanics.
//
// Owns every game-agnostic editor concern: editor toggle (backtick / `?edit`),
// the editable layout state + scratchpad persistence, piece selection, pointer
// dragging, arrow-key nudging, the magnifier toggle, and the keyboard controls
// (Esc / R / +/- / u/d / S). It is generic over the game's own layout type `L`;
// the game supplies thin adapters (`getAnchor` / `setAnchor` and optional
// scale / stack / export hooks) so its structured layout never has to change.
// ─────────────────────────────────────────────────────────────────────────────

const clamp  = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round2 = (v: number) => Math.round(v * 100) / 100

function readEditFlag(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('edit') === 'true'
}

export interface UseBoardLayoutEditorOptions<L> {
  /** The board stage element; used to convert px nudges/drags into % anchors. */
  stageRef: RefObject<HTMLElement | null>
  /** localStorage key for the editing scratchpad. */
  lsKey: string
  /** Initial layout (e.g. server sidecar merged with the localStorage scratchpad). */
  load: () => L
  /** Fresh factory defaults — the reset (`R`) target. */
  factory: () => L
  /** Read a named anchor out of the layout. */
  getAnchor: (layout: L, id: string) => Anchor | undefined
  /** Return a new layout with the named anchor replaced. */
  setAnchor: (layout: L, id: string, anchor: Anchor) => L
  /** Optional: grow/shrink the selected element (`+` / `-`). `dir` is +1 or -1. */
  scaleSelected?: (layout: L, id: string, dir: 1 | -1) => L
  /** Optional: adjust the token-stack peek (`u` / `d`). `dir` is +1 or -1. */
  adjustStackOffset?: (layout: L, dir: 1 | -1) => L
  /** Optional: legacy export-to-console on plain `S`. */
  onExport?: (layout: L) => void
}

export interface UseBoardLayoutEditorResult<L> {
  isEditorMode: boolean
  setIsEditorMode: Dispatch<SetStateAction<boolean>>
  layout: L
  setLayout: Dispatch<SetStateAction<L>>
  layoutRef: RefObject<L>
  selectedEl: string | null
  setSelectedEl: Dispatch<SetStateAction<string | null>>
  isMagnifier: boolean
  lensPos: { cx: number; cy: number }
  setLensPos: Dispatch<SetStateAction<{ cx: number; cy: number }>>
  /** Editor handle for a Zone (undefined when not editing). */
  editorFor: (id: string) => ZoneEditor | undefined
}

export function useBoardLayoutEditor<L>(
  opts: UseBoardLayoutEditorOptions<L>,
): UseBoardLayoutEditorResult<L> {
  const { stageRef, lsKey } = opts

  const [isEditorMode, setIsEditorMode] = useState<boolean>(readEditFlag)
  const [layout, setLayout]             = useState<L>(opts.load)
  const [selectedEl, setSelectedEl]     = useState<string | null>(null)
  const [isMagnifier, setIsMagnifier]   = useState(false)
  const [lensPos, setLensPos]           = useState({ cx: 0, cy: 0 })

  const layoutRef = useRef(layout)
  layoutRef.current = layout

  // Keep the latest adapters reachable from listeners without re-binding them.
  const optsRef = useRef(opts)
  optsRef.current = opts

  // Move the selected element's anchor by a (clamped) percentage delta.
  const nudge = useCallback((id: string, dLeft: number, dTop: number) => {
    const { getAnchor, setAnchor } = optsRef.current
    setLayout(L => {
      const a = getAnchor(L, id)
      if (!a) return L
      return setAnchor(L, id, {
        leftPct: round2(clamp(a.leftPct + dLeft, 0, 100)),
        topPct:  round2(clamp(a.topPct  + dTop,  0, 100)),
      })
    })
  }, [])

  // Pointer-drag an element: its centre follows the cursor inside the stage.
  const startDrag = useCallback((id: string, e: PointerEvent) => {
    if (!isEditorMode) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedEl(id)
    const stage = stageRef.current
    if (!stage) return
    const onMove = (ev: globalThis.PointerEvent) => {
      const r = stage.getBoundingClientRect()
      const leftPct = clamp(((ev.clientX - r.left) / r.width)  * 100, 0, 100)
      const topPct  = clamp(((ev.clientY - r.top)  / r.height) * 100, 0, 100)
      setLayout(L => optsRef.current.setAnchor(L, id, { leftPct: round2(leftPct), topPct: round2(topPct) }))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [isEditorMode, stageRef])

  // Global debug keys: ` toggles the editor, Z toggles the magnifier.
  useEffect(() => {
    function onToggle(e: KeyboardEvent) {
      if (e.key === '`') { setIsEditorMode(m => !m); setSelectedEl(null) }
      if (e.key === 'z' || e.key === 'Z') setIsMagnifier(m => !m)
    }
    window.addEventListener('keydown', onToggle)
    return () => window.removeEventListener('keydown', onToggle)
  }, [])

  // Editor keyboard controls: Esc, export (S), stack overlap (u/d), reset (R),
  // size (+/-), nudge (arrows).
  useEffect(() => {
    if (!isEditorMode) return
    function onKey(e: KeyboardEvent) {
      const { factory, scaleSelected, adjustStackOffset, onExport } = optsRef.current
      if (e.key === 'Escape') { setSelectedEl(null); return }
      // Plain S = optional console export; Ctrl/⌘+S (server save) is handled elsewhere.
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey) {
        onExport?.(layoutRef.current); e.preventDefault(); return
      }
      if ((e.key === 'u' || e.key === 'U') && adjustStackOffset) {
        setLayout(L => adjustStackOffset(L, 1)); e.preventDefault(); return
      }
      if ((e.key === 'd' || e.key === 'D') && adjustStackOffset) {
        setLayout(L => adjustStackOffset(L, -1)); e.preventDefault(); return
      }
      if (e.key === 'r' || e.key === 'R') {
        setLayout(factory())
        try { localStorage.removeItem(lsKey) } catch {}
        e.preventDefault(); return
      }
      if ((e.key === '+' || e.key === '=' || e.key === 'Add' || e.key === '-' || e.key === 'Subtract')
          && selectedEl && scaleSelected) {
        const dir: 1 | -1 = (e.key === '+' || e.key === '=' || e.key === 'Add') ? 1 : -1
        setLayout(L => scaleSelected(L, selectedEl, dir))
        e.preventDefault(); return
      }
      const stage = stageRef.current
      if (!selectedEl || !stage) return
      const W = stage.clientWidth, H = stage.clientHeight
      if (W === 0 || H === 0) return
      const big = e.shiftKey ? 10 : 1
      const stepX = (100 / W) * big   // % equivalent of 1px (×big) on each axis
      const stepY = (100 / H) * big
      switch (e.key) {
        case 'ArrowLeft':  nudge(selectedEl, -stepX, 0); break
        case 'ArrowRight': nudge(selectedEl,  stepX, 0); break
        case 'ArrowUp':    nudge(selectedEl, 0, -stepY); break
        case 'ArrowDown':  nudge(selectedEl, 0,  stepY); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEditorMode, selectedEl, lsKey, stageRef, nudge])

  // Auto-save to the localStorage scratchpad on every change while editing.
  useEffect(() => {
    if (!isEditorMode) return
    try { localStorage.setItem(lsKey, JSON.stringify(layout)) } catch {}
  }, [layout, isEditorMode, lsKey])

  // Editor handle passed to a Zone (undefined when not editing).
  const editorFor = useCallback((id: string): ZoneEditor | undefined => (
    isEditorMode
      ? { id, selected: selectedEl === id, onPointerDown: (e: PointerEvent) => startDrag(id, e) }
      : undefined
  ), [isEditorMode, selectedEl, startDrag])

  return {
    isEditorMode, setIsEditorMode,
    layout, setLayout, layoutRef,
    selectedEl, setSelectedEl,
    isMagnifier, lensPos, setLensPos,
    editorFor,
  }
}
