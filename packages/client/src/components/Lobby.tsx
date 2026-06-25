import { useState, useEffect, useCallback } from 'react'
import type { GameType, BotDifficulty, Player, RoomSummary } from '@gamengine/shared'
import type { AppSocket } from '../context/SocketContext'

const GAME_TYPE_LABELS: Record<GameType, string> = {
  TIC_TAC_TOE: 'Tres en raya',
  MANCALA:     'Mancala',
  SPLENDOR:    'Splendor',
}

const DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  MUY_FACIL:   'Muy Fácil',
  FACIL:       'Fácil',
  NORMAL:      'Normal',
  DIFICIL:     'Difícil',
  MUY_DIFICIL: 'Muy Difícil',
}

// ── How-to-play content ───────────────────────────────────────────────────────

interface Rule { heading: string; body: string }

const INSTRUCTIONS: Record<GameType, { title: string; rules: Rule[] }> = {
  TIC_TAC_TOE: {
    title: 'Cómo jugar — Tres en raya',
    rules: [
      {
        heading: 'Objetivo',
        body: 'Sé el primero en colocar tres de tus fichas en línea: horizontal, vertical o diagonal.',
      },
      {
        heading: 'Preparación',
        body: 'El tablero es una cuadrícula de 3×3. Un jugador es X y el otro es O. Las X siempre empiezan.',
      },
      {
        heading: 'Tu turno',
        body: 'Haz clic en cualquier celda vacía para colocar tu ficha. Los jugadores se alternan por turnos.',
      },
      {
        heading: 'Victoria',
        body: 'Gana el primero que alinee tres fichas. Si se llenan las 9 celdas sin ganador, la partida termina en empate.',
      },
    ],
  },
  MANCALA: {
    title: 'Cómo jugar — Mancala',
    rules: [
      {
        heading: 'Objetivo',
        body: "Acumula más semillas que tu rival en tu almacén. La partida termina cuando los seis hoyos de un jugador quedan vacíos.",
      },
      {
        heading: 'Preparación',
        body: 'Cada uno de los 12 hoyos pequeños empieza con 4 semillas. Cada jugador controla la fila más cercana a él y el almacén grande a su derecha.',
      },
      {
        heading: 'Tu turno',
        body: "Elige cualquiera de tus hoyos con semillas. Las semillas se reparten una a una en sentido antihorario por los hoyos siguientes y tu almacén, pero nunca en el almacén del rival.",
      },
      {
        heading: 'Turno extra',
        body: 'Si la última semilla cae en tu propio almacén, juegas de nuevo inmediatamente.',
      },
      {
        heading: 'Captura',
        body: 'Si la última semilla cae en uno de tus hoyos vacíos y el hoyo de enfrente tiene semillas, capturas todas las semillas de ambos hoyos y las llevas a tu almacén.',
      },
      {
        heading: 'Fin de partida',
        body: "Cuando los hoyos de un jugador quedan vacíos, el rival barre sus semillas restantes a su almacén. Quien tenga más semillas gana.",
      },
    ],
  },
  SPLENDOR: {
    title: 'Cómo jugar — Splendor',
    rules: [
      {
        heading: 'Objetivo',
        body: 'Consigue 15 puntos de prestigio comprando cartas de desarrollo. El jugador con más puntos al final de la ronda en que alguien llega a 15 gana.',
      },
      {
        heading: 'Turno',
        body: 'En tu turno puedes: tomar hasta 3 fichas de gemas de colores distintos, tomar 2 fichas del mismo color (si quedan ≥4), reservar una carta y tomar un oro, o comprar una carta de desarrollo pagando su coste en fichas.',
      },
      {
        heading: 'Cartas',
        body: 'Cada carta produce una gema permanente que descuenta su color en compras futuras. Las cartas de nivel superior requieren más gemas y dan más puntos de prestigio.',
      },
      {
        heading: 'Nobles',
        body: 'Al final de tu turno, si tienes la combinación de cartas que exige un noble, te visita automáticamente y te da 3 puntos.',
      },
    ],
  },
}

// ── Modal de instrucciones ────────────────────────────────────────────────────

function InstructionsModal({
  gameType,
  onClose,
}: {
  gameType: GameType
  onClose: () => void
}) {
  const { title, rules } = INSTRUCTIONS[gameType]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('keydown', handleKeyDown) }
  }, [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      style={modal.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={onClose}
    >
      <div style={modal.panel} onClick={(e) => e.stopPropagation()}>
        <div style={modal.header}>
          <h2 id="modal-title" style={modal.title}>{title}</h2>
          <button style={modal.closeBtn} onClick={onClose} aria-label="Cerrar instrucciones">✕</button>
        </div>
        <div style={modal.body}>
          {rules.map((rule) => (
            <div key={rule.heading} style={modal.rule}>
              <span style={modal.ruleHeading}>{rule.heading}</span>
              <span style={modal.ruleBody}>{rule.body}</span>
            </div>
          ))}
        </div>
        <div style={modal.footer}>
          <button style={modal.footerBtn} onClick={onClose}>Entendido</button>
        </div>
      </div>
    </div>
  )
}

// ── Lobby ─────────────────────────────────────────────────────────────────────

interface LobbyProps { socket: AppSocket }

export function Lobby({ socket }: LobbyProps) {
  const [nick, setNick]         = useState('')
  const [roomName, setRoomName] = useState('')
  const [gameType, setGameType] = useState<GameType>('TIC_TAC_TOE')
  const [joinId, setJoinId]     = useState('')
  const [rooms, setRooms]       = useState<RoomSummary[]>([])
  const [error, setError]       = useState<string | null>(null)

  const [nameError, setNameError]         = useState(false)
  const [roomNameError, setRoomNameError] = useState(false)
  const [codeError, setCodeError]         = useState(false)

  const [showInstructions, setShowInstructions] = useState(false)

  // Bot section state
  const [botGameType,   setBotGameType]   = useState<GameType>('TIC_TAC_TOE')
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('NORMAL')
  const [botNameError,  setBotNameError]  = useState(false)

  const closeInstructions = useCallback(() => setShowInstructions(false), [])

  useEffect(() => {
    const handleRoomsUpdated = (list: RoomSummary[]) => setRooms(list)
    socket.on('rooms_updated', handleRoomsUpdated)
    return () => { socket.off('rooms_updated', handleRoomsUpdated) }
  }, [socket])

  function makePlayer(): Player {
    return { id: socket.id ?? crypto.randomUUID(), name: nick.trim() }
  }

  function handleCreate() {
    const nickOk     = nick.trim() !== ''
    const roomNameOk = roomName.trim() !== ''
    if (!nickOk)     setNameError(true)
    if (!roomNameOk) setRoomNameError(true)
    if (!nickOk || !roomNameOk) return
    setError(null)
    socket.emit('create_room', roomName.trim(), gameType, makePlayer(), (roomId) => {
      console.log('Sala creada:', roomId)
    })
  }

  function handleJoinById() {
    const nickOk = nick.trim() !== ''
    const codeOk = joinId.trim() !== ''
    if (!nickOk) setNameError(true)
    if (!codeOk) setCodeError(true)
    if (!nickOk || !codeOk) return
    setError(null)
    socket.emit('join_room', joinId.trim().toUpperCase(), makePlayer(), (ok, err) => {
      if (!ok) setError(err ?? 'Error desconocido')
    })
  }

  function handleJoinRoom(roomId: string) {
    if (!nick.trim()) { setNameError(true); return }
    setError(null)
    socket.emit('join_room', roomId, makePlayer(), (ok, err) => {
      if (!ok) setError(err ?? 'Error desconocido')
    })
  }

  function handleCreateBotRoom() {
    if (!nick.trim()) { setBotNameError(true); return }
    setBotNameError(false)
    socket.emit('create_bot_room', botGameType, botDifficulty, makePlayer(), (roomId) => {
      console.log('Partida vs bot creada:', roomId)
    })
  }

  return (
    <div style={styles.page}>
      {showInstructions && (
        <InstructionsModal gameType={gameType} onClose={closeInstructions} />
      )}

      <h1 style={styles.title}>Gamengine Lobby</h1>

      {/* Apodo global */}
      <section style={styles.section}>
        <label style={styles.label}>
          Tu apodo <span style={styles.required}>*</span>
        </label>
        <input
          style={{ ...styles.input, ...(nameError || botNameError ? styles.inputError : {}) }}
          placeholder="ej. Chemi1"
          value={nick}
          onChange={(e) => {
            setNick(e.target.value)
            if (nameError)    setNameError(false)
            if (botNameError) setBotNameError(false)
          }}
        />
        {(nameError || botNameError) && <p style={styles.fieldError}>El nombre es obligatorio</p>}
      </section>

      <div style={styles.columns}>
        {/* Crear sala */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Crear sala</h2>
          <label style={styles.label}>
            Nombre de sala <span style={styles.required}>*</span>
          </label>
          <input
            style={{ ...styles.input, ...(roomNameError ? styles.inputError : {}) }}
            placeholder="ej. Sala 1"
            value={roomName}
            onChange={(e) => { setRoomName(e.target.value); if (roomNameError) setRoomNameError(false) }}
          />
          {roomNameError && <p style={styles.fieldError}>El nombre de sala es obligatorio</p>}

          <div style={styles.selectRow}>
            <select
              style={styles.select}
              value={gameType}
              onChange={(e) => setGameType(e.target.value as GameType)}
            >
              {(Object.keys(GAME_TYPE_LABELS) as GameType[]).map((g) => (
                <option key={g} value={g}>{GAME_TYPE_LABELS[g]}</option>
              ))}
            </select>
            <button
              style={styles.btnInstructions}
              type="button"
              onClick={() => setShowInstructions(true)}
              title={`Cómo jugar a ${GAME_TYPE_LABELS[gameType]}`}
            >
              ? Cómo jugar
            </button>
          </div>

          <button style={styles.btnPrimary} onClick={handleCreate}>
            Crear sala
          </button>
        </section>

        {/* Unirse por código */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Unirse por código</h2>
          <label style={styles.label}>
            Código de sala <span style={styles.required}>*</span>
          </label>
          <input
            style={{ ...styles.input, ...(codeError ? styles.inputError : {}) }}
            placeholder="ej. AB12CD"
            value={joinId}
            onChange={(e) => { setJoinId(e.target.value.toUpperCase()); if (codeError) setCodeError(false) }}
            maxLength={6}
          />
          {codeError && <p style={styles.fieldError}>El código de sala es obligatorio</p>}
          <button style={styles.btnSecondary} onClick={handleJoinById}>
            Unirse
          </button>
        </section>
      </div>

      {/* ── Jugar contra el bot ──────────────────────────────────────────────── */}
      <section style={styles.botSection}>
        <div style={styles.botCard}>
          <h2 style={styles.botTitle}>Jugar contra la máquina 💻</h2>
          <p style={styles.botSubtitle}>
            Partida privada inmediata — elige juego y dificultad.
          </p>
          <div style={styles.botControls}>
            <div style={styles.botField}>
              <label style={styles.label}>Juego</label>
              <select
                style={styles.select}
                value={botGameType}
                onChange={(e) => setBotGameType(e.target.value as GameType)}
              >
                {(Object.keys(GAME_TYPE_LABELS) as GameType[]).map((g) => (
                  <option key={g} value={g}>{GAME_TYPE_LABELS[g]}</option>
                ))}
              </select>
            </div>
            <div style={styles.botField}>
              <label style={styles.label}>Dificultad del Bot</label>
              <select
                style={styles.select}
                value={botDifficulty}
                onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
              >
                {(Object.keys(DIFFICULTY_LABELS) as BotDifficulty[]).map((d) => (
                  <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>
                ))}
              </select>
            </div>
          </div>
          <button style={styles.btnBot} onClick={handleCreateBotRoom}>
            Jugar vs 💻 Bot
          </button>
        </div>
      </section>

      {error && <p style={styles.error}>{error}</p>}

      {/* Salas disponibles */}
      <section style={{ ...styles.section, marginTop: 32 }}>
        <h2 style={styles.cardTitle}>Salas disponibles</h2>
        {rooms.length === 0 ? (
          <p style={styles.empty}>Todavía no hay salas. ¡Sé el primero en crear una!</p>
        ) : (
          <ul style={styles.roomList}>
            {rooms.map((room) => {
              const full = room.playerCount >= room.maxPlayers
              return (
                <li key={room.roomId} style={styles.roomItem}>
                  <div>
                    <span style={styles.roomName}>{room.roomName}</span>
                    <span style={styles.roomMeta}>
                      {' · '}{room.roomId}{' · '}{GAME_TYPE_LABELS[room.currentGameType]}
                    </span>
                  </div>
                  <div style={styles.roomRight}>
                    <span style={styles.roomCount}>
                      {room.playerCount}/{room.maxPlayers}
                    </span>
                    <button
                      style={{ ...styles.btnJoin, ...(full ? styles.btnJoinDisabled : {}) }}
                      disabled={full}
                      onClick={() => handleJoinRoom(room.roomId)}
                    >
                      {full ? 'Llena' : 'Unirse'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

// ── Lobby styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page:           { maxWidth: 640, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' },
  title:          { marginBottom: 24 },
  section:        { marginBottom: 16 },
  label:          { display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 },
  required:       { color: '#d32f2f', marginLeft: 2 },
  input:          { display: 'block', width: '100%', padding: '8px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, marginBottom: 4, boxSizing: 'border-box' },
  inputError:     { border: '1px solid #e57373', outline: 'none', boxShadow: '0 0 0 2px rgba(211,47,47,0.12)' },
  fieldError:     { margin: '0 0 8px', fontSize: 12, color: '#d32f2f' },
  selectRow:      { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  select:         { flex: 1, padding: '8px 10px', fontSize: 14, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', background: '#fff' },
  btnInstructions:{ flexShrink: 0, padding: '7px 10px', fontSize: 12, fontWeight: 600, color: '#1a73e8', background: '#f0f6ff', border: '1px solid #c5d9f8', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  columns:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  card:           { border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 },
  cardTitle:      { marginTop: 0, marginBottom: 12, fontSize: 16 },
  btnPrimary:     { width: '100%', padding: '8px 0', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  btnSecondary:   { width: '100%', padding: '8px 0', background: '#fff', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  error:          { color: '#d32f2f', marginTop: 8 },
  empty:          { color: '#888', fontStyle: 'italic' },
  roomList:       { listStyle: 'none', padding: 0, margin: 0 },
  roomItem:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #f0f0f0' },
  roomName:       { fontWeight: 600 },
  roomMeta:       { color: '#888', fontSize: 12 },
  roomRight:      { display: 'flex', alignItems: 'center', gap: 12 },
  roomCount:      { color: '#555', fontSize: 13 },
  btnJoin:        { padding: '4px 14px', background: '#34a853', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  btnJoinDisabled:{ background: '#bdbdbd', cursor: 'not-allowed' },

  // Bot section
  botSection:   { margin: '20px 0 0' },
  botCard:      { border: '2px solid #1a73e8', borderRadius: 10, padding: '18px 16px', background: 'linear-gradient(135deg, #f0f6ff 0%, #fff 100%)' },
  botTitle:     { margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1a1a1a' },
  botSubtitle:  { margin: '0 0 14px', fontSize: 13, color: '#666' },
  botControls:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  botField:     { display: 'flex', flexDirection: 'column' },
  btnBot:       { width: '100%', padding: '10px 0', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 15 },
}

// ── Modal styles ──────────────────────────────────────────────────────────────

const modal: Record<string, React.CSSProperties> = {
  backdrop:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  panel:       { background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 },
  title:       { margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a1a' },
  closeBtn:    { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', lineHeight: 1, padding: '2px 6px', borderRadius: 4 },
  body:        { overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  rule:        { display: 'flex', flexDirection: 'column', gap: 3 },
  ruleHeading: { fontSize: 13, fontWeight: 700, color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.04em' },
  ruleBody:    { fontSize: 14, color: '#444', lineHeight: 1.55 },
  footer:      { padding: '12px 20px', borderTop: '1px solid #f0f0f0', flexShrink: 0 },
  footerBtn:   { width: '100%', padding: '9px 0', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 14 },
}
