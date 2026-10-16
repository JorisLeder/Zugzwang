/** Text helpers of the primitives. */

/** Splits German text into sentences (keeps the punctuation). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}
