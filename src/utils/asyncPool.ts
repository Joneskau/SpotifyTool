export async function asyncPool<T, R>(
  poolLimit: number,
  items: T[],
  iteratorFn: (item: T, index: number) => Promise<R>,
  isCancelled: () => boolean = () => false
): Promise<PromiseSettledResult<R>[]> {
  const results: Promise<R>[] = [];
  const executing = new Set<Promise<R>>();

  for (const [index, item] of items.entries()) {
    if (isCancelled()) break;
    const promise = Promise.resolve().then(() => iteratorFn(item, index));
    results.push(promise);
    executing.add(promise);

    const clean = () => executing.delete(promise);
    promise.then(clean, clean);

    if (executing.size >= poolLimit) {
      await Promise.race(executing);
    }
  }

  return Promise.allSettled(results);
}
