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

/** How many discrete operations the undo/redo history keeps. */
const HISTORY_LIMIT = 5

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
  /**
   * Optional hierarchy adapter: return the *direct* child ids of `id` (i.e. the
   * elements whose `parentId === id`). When provided, dragging a container also
   * drags its whole subtree. The hook walks this recursively for grandchildren.
   */
  getChildren?: (layout: L, id: string) => string[]
  /**
   * Optional id of a root container (e.g. the main board). When set, a plain
   * click on empty stage space selects this id instead of clearing the
   * selection — so the board itself can be dragged/scaled like any element.
   */
  rootId?: string
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
  /** Undo the last layout operation (Ctrl/⌘+Z). */
  undo: () => void
  /** Redo the last undone operation (Ctrl/⌘+Y or Ctrl/⌘+Shift+Z). */
  redo: () => void
  /** Whether there is anything to undo / redo (for toolbar buttons). */
  canUndo: boolean
  canRedo: boolean
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

  // Undo/redo history of full layout snapshots (most recent last). Capped at
  // HISTORY_LIMIT discrete operations (a drag, a nudge, a scale step, a reset).
  const undoStack = useRef<L[]>([])
  const redoStack = useRef<L[]>([])
  // Bumped on every history change so canUndo/canRedo re-render reactively.
  const [, setHistoryVersion] = useState(0)
  const bumpHistory = useCallback(() => setHistoryVersion(v => v + 1), [])

  // Deep-ish clone of a layout snapshot (layouts are plain JSON: scales+anchors).
  const snapshot = useCallback((L: L): L => {
    try { return structuredClone(L) } catch { return JSON.parse(JSON.stringify(L)) as L }
  }, [])

  // Push the *current* layout onto the undo stack before a new mutation lands,
  // and drop the redo branch. Call this once at the start of each operation.
  const pushHistory = useCallback(() => {
    undoStack.current.push(snapshot(layoutRef.current))
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
    redoStack.current = []
    bumpHistory()
  }, [snapshot, bumpHistory])

  const undo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (prev === undefined) return
    redoStack.current.push(snapshot(layoutRef.current))
    if (redoStack.current.length > HISTORY_LIMIT) redoStack.current.shift()
    setLayout(prev)
    bumpHistory()
  }, [snapshot, bumpHistory])

  const redo = useCallback(() => {
    const next = redoStack.current.pop()
    if (next === undefined) return
    undoStack.current.push(snapshot(layoutRef.current))
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
    setLayout(next)
    bumpHistory()
  }, [snapshot, bumpHistory])

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

  // All descendant ids of `id` (children, grandchildren, …) per the optional
  // hierarchy adapter. Excludes `id` itself; cycle-safe via a visited set.
  const getDescendants = useCallback((L: L, id: string): string[] => {
    const getChildren = optsRef.current.getChildren
    if (!getChildren) return []
    const out: string[] = []
    const seen = new Set<string>([id])
    const walk = (parent: string) => {
      for (const child of getChildren(L, parent)) {
        if (seen.has(child)) continue   // guard against cycles / repeats
        seen.add(child)
        out.push(child)
        walk(child)
      }
    }
    walk(id)
    return out
  }, [])

  // Move one or more elements' anchors by a (clamped) percentage delta.
  // `ids` is de-duplicated so an element already present (e.g. a child also held
  // in a multi-selection) is never shifted twice in a single move.
  const nudge = useCallback((ids: string[], dLeft: number, dTop: number) => {
    const { getAnchor, setAnchor } = optsRef.current
    const unique = [...new Set(ids)]
    setLayout(L => {
      let next = L
      for (const id of unique) {
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
    const baseIds = movingGroup ? [...selectionRef.current] : [id]
    if (!movingGroup) { setSelection([id]); }
    setSelectedEl(id)

    // Expand every dragged element with its descendants so containers carry
    // their children. De-duplicate so a child already in the selection (or a
    // shared descendant of two containers) is never moved twice.
    const ids = [...new Set(
      baseIds.flatMap(b => [b, ...getDescendants(layoutRef.current, b)]),
    )]

    // A lone leaf (single element, no children) uses absolute "centre follows
    // cursor" placement; anything carrying others moves by incremental delta so
    // the whole subtree keeps its relative offsets.
    const absolutePlacement = ids.length === 1

    const r0 = stage.getBoundingClientRect()
    let lastX = e.clientX, lastY = e.clientY
    let dragged = false  // snapshot the layout only once a real drag begins

    const onMove = (ev: globalThis.PointerEvent) => {
      if (!dragged) { dragged = true; pushHistory() }  // one history entry per drag
      if (absolutePlacement) {
        // Single piece: centre follows the cursor (absolute placement).
        const leftPct = clamp(((ev.clientX - r0.left) / r0.width)  * 100, 0, 100)
        const topPct  = clamp(((ev.clientY - r0.top)  / r0.height) * 100, 0, 100)
        setLayout(L => optsRef.current.setAnchor(L, id, { leftPct: round2(leftPct), topPct: round2(topPct) }))
      } else {
        // Container / group: shift every member by the same incremental delta.
        const dLeft = ((ev.clientX - lastX) / r0.width)  * 100
        const dTop  = ((ev.clientY - lastY) / r0.height) * 100
        nudge(ids, dLeft, dTop)
      }
      // lastX/lastY update stays outside the branch so the delta stays accurate
      // for the whole group across consecutive move events.
      lastX = ev.clientX; lastY = ev.clientY
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [isEditorMode, stageRef, toggleInSelection, nudge, pushHistory, getDescendants])

  // Pointer-down on empty stage / board background. Three outcomes:
  //  • root already selected + drag  → move the whole board (root + subtree),
  //  • drag (no root selected)       → marquee-select pieces,
  //  • plain click                   → select the root container (or clear).
  const startMarquee = useCallback((e: PointerEvent) => {
    if (!isEditorMode) return
    const stage = stageRef.current
    if (!stage) return
    const r = stage.getBoundingClientRect()
    const ox = e.clientX - r.left
    const oy = e.clientY - r.top
    const rootId = optsRef.current.rootId
    const ctrlOrMeta = e.ctrlKey || e.metaKey

    // If the root (board) is the current selection, a drag here moves it and its
    // descendants by delta — same path as dragging a container Zone.
    const movingRoot = !!rootId && !ctrlOrMeta && selectionRef.current.length === 1 && selectionRef.current[0] === rootId
    if (movingRoot) {
      const ids = [rootId!, ...getDescendants(layoutRef.current, rootId!)]
      let lastX = e.clientX, lastY = e.clientY
      let dragged = false
      const onMove = (ev: globalThis.PointerEvent) => {
        if (!dragged) { dragged = true; pushHistory() }
        const dLeft = ((ev.clientX - lastX) / r.width)  * 100
        const dTop  = ((ev.clientY - lastY) / r.height) * 100
        nudge(ids, dLeft, dTop)
        lastX = ev.clientX; lastY = ev.clientY
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      return
    }

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
          const rootSelected = !!rootId && selectionRef.current.includes(rootId)
          if (ctrlOrMeta && rootSelected) {
            // Ctrl/⌘+click while root is selected → deselect.
            clearSelection()
          } else if (rootId) {
            // Plain click → select the root container (the board).
            setSelection([rootId]); setSelectedEl(rootId)
          } else {
            clearSelection()
          }
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
  }, [isEditorMode, stageRef, clearSelection, getDescendants, nudge, pushHistory])

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

      // Undo / redo — Ctrl/⌘+Z and Ctrl/⌘+Y (also Ctrl/⌘+Shift+Z to redo).
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) redo(); else undo()
        e.preventDefault(); return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        redo(); e.preventDefault(); return
      }

      if (e.key === 'Escape') { clearSelection(); return }
      // Plain S = optional console export; Ctrl/⌘+S (server save) is handled elsewhere.
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey) {
        onExport?.(layoutRef.current); e.preventDefault(); return
      }
      if ((e.key === 'u' || e.key === 'U') && adjustStackOffset) {
        pushHistory()
        setLayout(L => adjustStackOffset(L, 1)); e.preventDefault(); return
      }
      if ((e.key === 'd' || e.key === 'D') && adjustStackOffset) {
        pushHistory()
        setLayout(L => adjustStackOffset(L, -1)); e.preventDefault(); return
      }
      if (e.key === 'r' || e.key === 'R') {
        pushHistory()
        setLayout(factory())
        try { localStorage.removeItem(lsKey) } catch {}
        e.preventDefault(); return
      }
      if ((e.key === '+' || e.key === '=' || e.key === 'Add' || e.key === '-' || e.key === 'Subtract')
          && targets.length > 0 && scaleSelected) {
        const dir: 1 | -1 = (e.key === '+' || e.key === '=' || e.key === 'Add') ? 1 : -1
        pushHistory()
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
      // Carry descendants of every target so containers nudge their subtree too.
      const L0 = layoutRef.current
      const moveTargets = [...new Set(targets.flatMap(t => [t, ...getDescendants(L0, t)]))]
      switch (e.key) {
        case 'ArrowLeft':  pushHistory(); nudge(moveTargets, -stepX, 0); break
        case 'ArrowRight': pushHistory(); nudge(moveTargets,  stepX, 0); break
        case 'ArrowUp':    pushHistory(); nudge(moveTargets, 0, -stepY); break
        case 'ArrowDown':  pushHistory(); nudge(moveTargets, 0,  stepY); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isEditorMode, selectedEl, lsKey, stageRef, nudge, clearSelection, pushHistory, undo, redo, getDescendants])

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
    undo, redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  }
}
