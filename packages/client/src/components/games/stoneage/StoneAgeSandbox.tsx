import { useState } from 'react'
import type { StoneAgePlayerColor } from '@gamengine/shared'
import { initStoneAgeGame } from './core/initialState'
import { StoneAgeBoard } from './Board'

// ─────────────────────────────────────────────────────────────────────────────
// Stone Age — dev sandbox.
//
// Standalone page that seeds a 2-player game and renders the board with the
// real assets. The board uses `extras/board.jpg` as its canvas and the generic
// layout editor (Zone + useBoardLayoutEditor): append `?edit=true` to drag the
// hut piles / civilization cards and Ctrl/⌘+S to persist.
//
// Accessible at: http://localhost:5173/stoneage-sandbox
//
// The "Refrescar estado" button re-runs initStoneAgeGame so you can watch the
// shuffle (hut piles + civilization market) change on every click.
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_PLAYERS: { id: string; name: string; color: StoneAgePlayerColor }[] = [
  { id: 'p1', name: 'Miguel', color: 'YELLOW' },
  { id: 'p2', name: 'Antón',  color: 'RED'    },
]

// Stub callbacks so StoneAgeBoard receives all expected props.
function noop() {}

export function StoneAgeSandbox() {
  const [gameState, setGameState] = useState(() => initStoneAgeGame(MOCK_PLAYERS))

  return (
    <div className="min-h-screen bg-[#2a1a0e]">
      {/* Sandbox dev bar — sits above the game header so there is no overlap */}
      <div style={{
        background: 'rgba(0,0,0,0.55)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '5px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 200,
      }}>
        <span style={{ color: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}>
          🔧 Sandbox · Stone Age
        </span>
        <button
          type="button"
          onClick={() => setGameState(initStoneAgeGame(MOCK_PLAYERS))}
          style={{
            padding: '3px 10px', background: '#d97706', color: '#fff',
            border: 'none', borderRadius: 5, cursor: 'pointer',
            fontSize: 11, fontWeight: 700,
          }}
        >
          🔀 Refrescar
        </button>
        <span style={{ color: '#4b5563', fontSize: 10, marginLeft: 'auto', fontFamily: 'monospace' }}>
          ?edit=true → maquetación
        </span>
      </div>

      <StoneAgeBoard
        stoneAgeState={gameState}
        myPlayerId="p1"
        isMyTurn={true}
        gameOver={false}
        onLeave={noop}
        onRematch={noop}
        rematchVotes={[]}
        playerCount={MOCK_PLAYERS.length}
      />
    </div>
  )
}
