/** Polls `check` until it returns a truthy value (or throws after `timeoutMs`). Test helper. */
export async function waitFor<T>(check: () => T | Promise<T>, timeoutMs = 3000, intervalMs = 10): Promise<NonNullable<T>> {
  const start = Date.now();
  let last: unknown;
  for (;;) {
    try {
      const v = await check();
      if (v) return v as NonNullable<T>;
    } catch (e) {
      last = e;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor: timed out after ${timeoutMs} ms${last ? ` (${String(last)})` : ''}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
