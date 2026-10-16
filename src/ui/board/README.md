# `@/ui/board` – the chessboard (WP-01)

One board for every board screen (puzzles, games, lessons, analysis). Built on react-chessboard v5 with
`@/lib/chess` for all rules – the board never decides legality, check, castling or en passant itself.
Visuals follow DESIGN.md §2.2 (tokens), §4 (presentation), §6 (motion/sound), §7 (accessibility).

```tsx
import { Board, BoardMenu, FlipBoardButton } from '@/ui/board';

<Board
  fen={fen}
  orientation={orientation}
  onMove={(move) => game.move(move.uci)}       // MoveRecord, `ply` is relative to the shown position (1)
  onMoveAttempt={async (input) => ok}           // optional veto/confirmation before the move is committed
  lastMove={{ from: 'e2', to: 'e4' }}
  onFlip={() => setOrientation(flip)}           // enables the F key
/>
```

## Props (`BoardProps`)

| Prop | Default | Meaning |
| --- | --- | --- |
| `fen` | – | Position to show. An invalid FEN renders without interaction. |
| `orientation` | `'white'` | Side at the bottom. |
| `interactive` | `true` | Moves allowed (only the side to move; never after the game is over per `ChessGame.status()`). |
| `onMove(move)` | – | Called with the `MoveRecord` after `onMoveAttempt` accepted it. Apply `move.uci` to your own `ChessGame`. |
| `onMoveAttempt(input)` | – | `boolean \| Promise<boolean>`; `false` rejects (coach warning, move confirmation, "replace later moves?"). While it is pending further moves are ignored; if `fen` changes meanwhile the move is dropped. |
| `arrows` | `[]` | Programmatic arrows `{ from, to, kind }`: `best` green, `threat` red, `hint` blue, `user` orange, `played` yellow. |
| `marks` | `[]` | Square highlights `{ square, kind }`: `hint-piece`/`hint-target` (fill + two-tone inset rings), `danger`, `selected`, `last-move`, `check`, `user` (red). |
| `annotations` | `[]` | Classification badge `{ square, classification }` at the top-right corner of the square (DESIGN §4.5). Pass only the current move's. |
| `feedback` | `null` | `{ square, result: 'correct' \| 'wrong' }`: correct/wrong fill plus check/X badge (DESIGN §4.4) for puzzles and lessons. |
| `lastMove` | `null` | From/to highlight of the last move. |
| `highlightCheck` | `true` | Red glow under a king in check. |
| `allowUserArrows` | `true` | Right-drag arrows and right-click marks (desktop mouse only). |
| `showCoordinates` | `settings.showCoordinates` | Coordinates inside the board. |
| `showLegalMoves` | `settings.showLegalMoves` | Legal-move dots and capture rings for the selected piece. |
| `onFlip` | – | Called by the `F` key while the board has the focus. |
| `onSquareClick(square)` | – | Every click/tap or keyboard activation of a square, also when not `interactive` (position editor, "click the square" tasks). |
| `sound` | `true` | Plays move/capture/check for moves made on the board (respects `settings.sound`). |
| `label` | "Schachbrett, du spielst Weiß/Schwarz" | Accessible name. |
| `className` | – | Extra classes for the root. |

The board fills its container (`aspect-square w-full`); size it with `BoardLayout` (board size rule, DESIGN §3.3/§3.4).

## Behaviour

- **Moving:** drag-and-drop, click-click and tap-tap. Selecting a piece shows legal targets (dots, capture rings).
  Illegal drops snap back without any state change, sound or message. Castling: move the king two squares or drop/click
  it onto its own rook. En passant, castling rights and check rules come from chess.js via `@/lib/chess`.
- **Promotion:** picker on the promotion file with Dame, Turm, Läufer, Springer (no auto-queen); Dame has the focus,
  ↑/↓ move between options, `Esc` or a click outside cancels and the pawn stays.
- **User shapes (desktop):** right-drag = arrow, right-click = mark; Shift green, Alt blue, Ctrl/Strg yellow, plain =
  orange arrow / red mark. Right-click on a marked square removes the mark; a left click clears everything; a new
  position clears them too.
- **Keyboard (DESIGN §7.4):** the board is one tab stop (`role="application"`). Tab in → cursor on the selected square,
  the last move's target or the own king. Arrow keys move the cursor (orientation-aware), Enter/Space pick up and move,
  `Esc` cancels the selection, `F` flips (with `onFlip`). Arrow keys are not passed on to page shortcuts.
- **Screen readers:** every square is named ("e4, weißer Bauer", "d5, leer", "…, ausgewählt", "…, Zug möglich") and is
  the active descendant of the board; moves (own, opponent's, one step forward) are announced in a polite live region:
  "Weiß: Springer nach f3. Schach.". react-chessboard's drag layer is removed from the tab order and its English
  texts are hidden.
- **Animations:** 150 ms piece moves; off with `settings.animations = false`, `prefers-reduced-motion` or in e2e.
- **Board design:** Moos (default) and Holz via `<html data-board>` (set from `settings.boardTheme`); options in
  `boardTheme.ts` (`boardThemeOptions`, `BOARD_THEMES`).

## Selector contract (e2e helpers depend on it)

Root `[data-testid="board"]` with `data-orientation` and `data-fen`; every square `[data-square="e4"]`; every piece
`[data-piece="wP"]`; promotion buttons `[data-testid="promotion-q|r|b|n"]`.
Extra hooks: `data-highlights` on the inner square element (`last-move`, `check`, `selected`, `move-target`,
`capture-target`, `hint-piece`, `hint-target`, `danger`, `mark`, `correct`, `wrong`, `user-mark-<colour>`), arrows
`[data-arrow="e2-e4"]` with `data-arrow-source` (`program`/`user`/`preview`) and `data-arrow-kind`,
`[data-annotation="e4"]`, `[data-feedback]`, `[data-testid="board-cursor"]`, `[data-testid="board-announcer"]`.

## Other exports

- `FlipBoardButton({ onFlip })` – "Brett drehen" icon button (`ArrowDownUp`).
- `BoardMenu({ onFlip? })` – the ⋮ menu: Brett drehen, Töne (persists `settings.sound`), Einstellungen. Needs
  `ServicesProvider` and a router; put it into `BoardLayout`'s `menu` slot.
- `PieceIcon({ piece: 'wK' })` – piece artwork as a decorative icon.
- `PromotionPicker` – used by `Board`; exported for custom flows.
- Helpers: `describeMoveDe(move)`, `findMoveBetween(fenBefore, fenAfter)`, `squareLabelDe(square, piece)`.

## Sounds

`Board` plays the move sound for moves made on it. Callers play everything else with `@/ui/sound`:
`playSound(soundForMove(move))` for opponent/bot/demo moves, `playSound('success')` and `playSound('error')`.
Identical sounds within 60 ms play once, so a double report is harmless.
