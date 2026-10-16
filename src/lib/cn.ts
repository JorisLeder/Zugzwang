/** Class name helper: `clsx` + `tailwind-merge` aware of our custom typography tokens. Frozen (WP-00). */
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      // Font-size tokens from src/styles/app.css (`text-h1`, `text-body-sm`, …) – otherwise they would be taken for colours.
      text: ['display', 'h1', 'h2', 'h3', 'body-lg', 'body', 'body-sm', 'move', 'caption'],
    },
  },
});

/** Joins class names and resolves Tailwind conflicts (later wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
