/**
 * Run async tasks with limited concurrency (like p-limit but zero-dependency).
 * Returns PromiseSettledResult[] in the same order as the input items.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let idx = 0

  async function worker() {
    while (idx < items.length) {
      const i = idx++
      try {
        // biome-ignore lint/style/noNonNullAssertion: idx is always within bounds
        results[i] = { status: 'fulfilled', value: await fn(items[i]!) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}
