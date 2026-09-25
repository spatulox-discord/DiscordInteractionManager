/**
 * Runs the given functions one after the other, each one starting when the previous one ends.
 */
export class Mutex {
    private last: Promise<unknown> = Promise.resolve();

    run<T>(fn: () => Promise<T>): Promise<T> {
        const result = this.last.then(fn);
        // The next one waits for this one, even when it fails
        this.last = result.catch(() => {});
        return result;
    }
}
