/** `@/ui/board` – the chessboard and its controls (WP-01). API: `src/ui/board/README.md`. */
export { Board, type BoardProps } from './Board';
export { BoardMenu, type BoardMenuProps } from './BoardMenu';
export { FlipBoardButton, type FlipBoardButtonProps } from './FlipBoardButton';
export { PieceIcon, type PieceCode, type PieceIconProps } from './PieceIcon';
export { PromotionPicker, type PromotionPickerProps } from './PromotionPicker';
export { BOARD_THEMES, PIECE_ANIMATION_MS, boardThemeOptions } from './boardTheme';
export {
  describeMoveDe,
  findMoveBetween,
  squareLabelDe,
  type BoardFeedback,
  type Orientation,
  type UserArrow,
  type UserMark,
  type UserShapeColor,
} from './boardLogic';
