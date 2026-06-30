import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type Dispatch, type PointerEvent, type RefObject, type SetStateAction,
} from 'react'
import type { Anchor } from '@gamengine/shared'
import type { ZoneEditor, ZoneBox } from '../components/board/Zone'

// ─────────────────────────────────────────────────────────────────────────────
// useBoardLayoutEditor — generic visual layout-editor mechanics.
//
// Owns every game-agnostic editor concern: editor toggle (backtick / `?edit`),
// the editable layout state + scratchpad persistence, piece selection, pointer
// dragging, arrow-key nudging, the magnifier toggle, and the keyboard controls
// (Esc / R / +/- / u/d / S). It is generic over the game's own layout type `L`;
// the game supplies thin adapters (`getAnchor` / `setAnchor` and optional
// scale / stack / export hooks) so its structured layout never has to change.
//
// Multi-selection: every Zone reports its on-screen bounds via `registerBounds`.
// Dragging on empty stage space draws a marquee rectangle; on release, all zones
// whose bounds intersect it (AABB) become the `selection`. Shift+clicking a zone
// toggles it in/out of the selection; a plain click on empty space clears it.
// `scaleSelected` (and arrow-nudging) then act on every selected element.
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
  /** Optional: grow/shrink one element (`+` / `-`). `dir` is +1 or -1. */
  scaleSelected?: (layout: L, id: string, dir: 1 | -1) => L
  /** Optional: adjust the token-stack peek (`u` / `d`). `dir` is +1 or -1. */
  adjustStackOffset?: (layout: L, dir: 1 | -1) => L
  /** Optional: legacy export-to-console on plain `S`. */
  onExport?: (layout: L) => void
}

/** Marquee rectangle in stage-local px (null when no marquee is being drawn). */
export interface MarqueeRect { x: number; y: number; w: number; h: number }

/** A zone's on-screen box in stage-local px, reported by each Zone. */
type ZoneBounds = ZoneBox

export interface UseBoardLayoutEditorResult<L> {
  isEditorMode: boolean
  setIsEditorMode: Dispatch<SetStateAction<boolean>>
  layout: L
  setLayout: Dispatch<SetStateAction<L>>
  layoutRef: RefObject<L>
  selectedEl: string | null
  setSelectedEl: Dispatch<SetStateAction<string | null>>
  /** All currently-selected element ids (marquee + shift-click). */
  selection: string[]
  /** Replace the selection programmatically (e.g. external "select all"). */
  setSelection: Dispatch<SetStateAction<string[]>>
  /** Clear the current selection (and single selectedEl). */
  clearSelection: () => void
  isMagnifier: boolean
  lensPos: { cx: number; cy: number }
  setLensPos: Dispatch<SetStateAction<{ cx: number; cy: number }>>
  /** Editor handle for a Zone (undefined when not editing). */
  editorFor: (id: string) => ZoneEditor | undefined
  /** Props to spread on the stage element to enable marquee selection. */
  stageSelectionProps: {
    onPointerDown: (e: PointerEvent) => void
  }
  /** The live marquee rectangle to render (null when idle). */
  marqueeRect: MarqueeRect | null
  /** Convenience style for the marquee overlay div. */
  marqueeStyle: CSSProperties | null
}

export function useBoardLayoutEditor<L>(
  opts: UseBoardLayoutEditorOptions<L>,
): UseBoardLayoutEditorResult<L> {
  const { stageRef, lsKey } = opts

  const [isEditorMode, setIsEditorMode] = useState<boolean>(readEditFlag)
  const [layout, setLayout]             = useState<L>(opts.load)
  const [selectedEl, setSelectedEl]     = useState<string | null>(null)
  const [selection, setSelection]       = useState<string[]>([])
  const [isMagnifier, setIsMagnifier]   = useState(false)
  const [lensPos, setLensPos]           = useState({ cx: 0, cy: 0 })
  const [marqueeRect, setMarqueeRect]   = useState<MarqueeRect | null>(null)

  const layoutRef = useRef(layout)
  layoutRef.current = layout

  // Latest selection reachable from key listeners without re-binding them.
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  // Per-zone bounds registry (stage-local px), kept current by each Zone.
  const boundsRef = useRef<Map<string, ZoneBounds>>(new Map())

  // Keep the latest adapters reachable from listeners without re-binding them.
  const optsRef = useRef(opts)
  optsRef.current = opts

  // A Zone reports (or clears) its on-screen box so the marquee can hit-test it.
  const registerBounds = useCallback((id: string, b: ZoneBounds | null) => {
    if (b) boundsRef.current.set(id, b)
    else   boundsRef.current.delete(id)
  }, [])

  const clearSelection = useCallback(() => {
    setSelection([])
    setSelectedEl(null)
  }, [])

  // Toggle a single id in/out of the selection (shift-click).
  const toggleInSelection = useCallback((id: string) => {
    setSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setSelectedEl(id)
  }, [])

  // Move one or more elements' anchors by a (clamped) percentage delta.
  const nudge = useCallback((ids: string[], dLeft: number, dTop: number) => {
    const { getAnchor, setAnchor } = optsRef.current
    setLayout(L => {
      let next = L
      for (const id of ids) {
        const a = getAnchor(next, id)
        if (!a) continue
        next = setAnchor(next, id, {
          leftPct: round2(clamp(a.leftPct + dLeft, 0, 100)),
          topPct:  round2(clamp(a.topPct  + dTop,  0, 100)),
        })
      }
      return next
    })
  }, [])

  // Pointer-down on a zone. Shift toggles it in the selection (no drag).
  // Otherwise it becomes the active element and drags; if it was part of a
  // multi-selection, the whole selection drags together by the same delta.
  const startDrag = useCallback((id: string, e: PointerEvent) => {
    if (!isEditorMode) return
    e.preventDefault()
    e.stopPropagation()

    if (e.shiftKey) {
      toggleInSelection(id)
      return
    }

    const stage = stageRef.current
    if (!stage) return

    // Drag the whole selection only if this zone is already part of it;
    // otherwise this is a fresh single-element drag (and resets the selection).
    const movingGroup = selectionRef.current.includes(id) && selectionRef.current.length > 1
    const ids = movingGroup ? [...selectionRef.current] : [id]
    if (!movingGroup) { setSelection([id]); }
    setSelectedEl(id)

    const r0 = stage.getBoundingClientRect()
    let lastX = e.clientX, lastY = e.clientY

    const onMove = (ev: globalThis.PointerEvent) => {
      if (ids.length === 1) {
        // Single piece: centre follows the cursor (absolute placement).
        const leftPct = clamp(((ev.clientX - r0.left) / r0.width)  * 100, 0, 100)
        const topPct  = clamp(((ev.clientY - r0.top)  / r0.height) * 100, 0, 100)
        setLayout(L => optsRef.current.setAnchor(L, id, { leftPct: round2(leftPct), topPct: round2(topPct) }))
      } else {
        // Group: shift every member by the same incremental delta.
        const dLeft = ((ev.clientX - lastX) / r0.width)  * 100
        const dTop  = ((ev.clientY - lastY) / r0.height) * 100
        nudge(ids, dLeft, dTop)
      }
      lastX = ev.clientX; lastY = ev.clientY
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [isEditorMode, stageRef, toggleInSelection, nudge])

  // Pointer-down on empty stage space → start a marquee (or clear on click).
  const startMarquee = useCallback((e: PointerEvent) => {
    if (!isEditorMode) return
    // Ignore when the press originated on a Zone (it stops propagation), so this
    // only fires for genuinely empty stage space.
    const stage = stageRef.current
    if (!stage) return
    const r = stage.getBoundingClientRect()
    const ox = e.clientX - r.left
    const oy = e.clientY - r.top
    let moved = false

    const onMove = (ev: globalThis.PointerEvent) => {
      const cx = clamp(ev.clientX - r.left, 0, r.width)
      const cy = clamp(ev.clientY - r.top,  0, r.height)
      const x = Math.min(ox, cx), y = Math.min(oy, cy)
      const w = Math.abs(cx - ox), h = Math.abs(cy - oy)
      if (w > 3 || h > 3) moved = true
      setMarqueeRect({ x, y, w, h })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setMarqueeRect(curr => {
        if (!moved || !curr) {
          // Plain click on empty space → clear selection.
          clearSelection()
          return null
        }
        // AABB hit-test every registered zone against the marquee.
        const mx2 = curr.x + curr.w, my2 = curr.y + curr.h
        const hit: string[] = []
        for (const [id, b] of boundsRef.current) {
          const overlap = b.left < mx2 && b.right > curr.x && b.top < my2 && b.bottom > curr.y
          if (overlap) hit.push(id)
        }
        setSelection(hit)
        setSelectedEl(hit[0] ?? null)
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [isEditorMode, stageRef, clearSelection])

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
  // size (+/-), nudge (arrows). Size and nudge act on the whole selection when
  // one exists, otherwise on the single active element.
  useEffect(() => {
    if (!isEditorMode) return
    function onKey(e: KeyboardEvent) {
      const { factory, scaleSelected, adjustStackOffset, onExport } = optsRef.current
      // The effective target set: the marquee/shift selection, or the lone active el.
      const targets = selectionRef.current.length > 0
        ? selectionRef.current
        : (selectedEl ? [selectedEl] : [])

      if (e.key === 'Escape') { clearSelection(); return }
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
          && targets.length > 0 && scaleSelected) {
        const dir: 1 | -1 = (e.key === '+' || e.key === '=' || e.key === 'Add') ? 1 : -1
        setLayout(L => targets.reduce((acc, id) => scaleSelected(acc, id, dir), L))
        e.preventDefault(); return
      }
      const stage = stageRef.current
      if (targets.length === 0 || !stage) return
      const W = stage.clientWidth, H = stage.clientHeight
      if (W === 0 || H === 0) return
      const big = e.shiftKey ? 10 : 1
      const stepX = (100 / W) * big   // % equivalent of 1px (×big) on each axis
      const stepY = (100 / H) * big
      switch (e.key) {
        case 'ArrowLeft':  nudge(targets, -stepX, 0); break
        case 'ArrowRight': nudge(targets,  stepX, 0); break
        case 'ArrowUp':    nudge(targets, 0, -stepY); break
        case 'ArrowDown':  nudge(targets, 0,  stepY); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEditorMode, selectedEl, lsKey, stageRef, nudge, clearSelection])

  // Auto-save to the localStorage scratchpad on every change while editing.
  useEffect(() => {
    if (!isEditorMode) return
    try { localStorage.setItem(lsKey, JSON.stringify(layout)) } catch {}
  }, [layout, isEditorMode, lsKey])

  // Editor handle passed to a Zone (undefined when not editing).
  const editorFor = useCallback((id: string): ZoneEditor | undefined => (
    isEditorMode
      ? {
          id,
          selected: selectedEl === id || selection.includes(id),
          onPointerDown: (e: PointerEvent) => startDrag(id, e),
          registerBounds: (b) => registerBounds(id, b),
        }
      : undefined
  ), [isEditorMode, selectedEl, selection, startDrag, registerBounds])

  // Marquee overlay style derived from the live rectangle.
  const marqueeStyle: CSSProperties | null = marqueeRect
    ? {
        position: 'absolute',
        left: marqueeRect.x, top: marqueeRect.y,
        width: marqueeRect.w, height: marqueeRect.h,
        border: '1px solid #3b82f6',
        background: 'rgba(59,130,246,0.15)',
        pointerEvents: 'none', zIndex: 60,
      }
    : null

  return {
    isEditorMode, setIsEditorMode,
    layout, setLayout, layoutRef,
    selectedEl, setSelectedEl,
    selection, setSelection, clearSelection,
    isMagnifier, lensPos, setLensPos,
    editorFor,
    stageSelectionProps: { onPointerDown: startMarquee },
    marqueeRect, marqueeStyle,
  }
}
