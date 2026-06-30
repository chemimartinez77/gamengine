# Changelog

Registro de cambios del monorepo **Gamengine Project**.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/);
las fechas siguen el formato `YYYY-MM-DD`.

## 2026-06-30 (sesión 1)

*   **Layout Editor**:
    *   **Jerarquía**: Los tableros (Principal y PlayerDashboards) ahora son piezas seleccionables y desplazables.
    *   **Desplazamiento**: Implementado movimiento jerárquico; al mover un tablero, todos los elementos hijos (meeples, cartas, losetas) se desplazan de forma solidaria.
    *   **UX**: Selección de `board_root` mediante clic en zonas vacías del lienzo.
*   **Refactor de UI**: Los tableros de jugador han migrado de la barra lateral al *stage* principal, permitiendo una maquetación unificada sobre el lienzo.

### Stone Age Integration & Layout Editor Overhaul

*   **Game Engine**: Implementado **Stone Age** (motor completo y UI con artes oficiales).
*   **Layout Editor (Pro-grade)**: 
    *   **Selección**: Añadida *marquee selection* para manipular múltiples objetos simultáneamente.
    *   **Historial**: Sistema de *Undo/Redo* (5 pasos) para todas las mutaciones de diseño.
    *   **Escalado**: Sistema de escalas independientes por entidad (`hutScale`, `civScale`, etc.).
*   **UI/UX**: Tableros de jugador dinámicos y mazos de cabañas optimizados (visualización de loseta única + contador).
*   **Infraestructura**: Migración a Tailwind v4 y optimización del flujo de trabajo en Sandbox (`?edit=true`).

### Editor de maquetación — selección múltiple y escala por elemento

- **Marquee + multi-selección** (`useBoardLayoutEditor`): se añade un array
  `selection` al estado del editor. Arrastrar sobre espacio vacío del lienzo
  dibuja un rectángulo y, al soltar, selecciona por colisión AABB todas las
  zonas intersecadas. `Shift`+clic alterna una zona en/fuera de la selección y
  un clic simple en vacío la limpia. Arrastrar una zona ya seleccionada mueve
  todo el grupo por el mismo delta. Las flechas (nudge) y `+/-` (escala)
  operan sobre la selección completa.
  - Se exponen `selection`, `setSelection`, `clearSelection`,
    `stageSelectionProps`, `marqueeRect` y `marqueeStyle` desde el hook.
  - Archivo: `packages/client/src/hooks/useBoardLayoutEditor.ts`.

- **Registro de bounds en `Zone`**: cada zona reporta su caja en píxeles
  relativos al stage (`registerBounds`) mediante `useLayoutEffect`, para que el
  marquee pueda hacer hit-test. Tipo `ZoneBox` compartido con el hook.
  - Archivo: `packages/client/src/components/board/Zone.tsx`.

- **Escala por elemento** (antes era por grupo `hutScale`/`civScale`): cada
  componente es ahora una entidad independiente con su propia escala
  (`scales[id]`). `scaleStoneAgeElement` escala un único id (el hook lo invoca
  una vez por elemento seleccionado) y `getStoneAgeElementScale` la lee.
  `fromStoneAgeShared` migra los valores heredados de grupo
  (`hutScale`/`civScale`/`cardScale`) a escalas por elemento.
  - Archivos: `packages/client/src/components/games/stoneage/boardLayout.ts`,
    `Board.tsx` (consumo de ancho por id + render del marquee + wiring de
    `stageSelectionProps`).

- **Toolbar**: muestra el estado de la selección («Sin selección», «1 elemento»
  o «Múltiple · N elementos») y un botón «Limpiar selección». Se retira el
  lector de escalas por grupo.
  - Archivo: `packages/client/src/components/board/LayoutEditorToolbar.tsx`.

- **Persistencia**: `layout.json` migra al esquema de escalas por elemento,
  preservando los valores calibrados (cabañas → 1.9, cartas → 2.5) y los
  anchors actuales. Sigue siendo la fuente de verdad del editor.
  - Archivo: `packages/client/src/components/games/stoneage/layout.json`.
