export interface AsyncPushCallbacks<T> {
    next: (value: T) => void;
    done: () => void;
    error: (err: unknown) => void;
    registerCleanup?: (cb: () => void | Promise<void>) => void;
}
export declare function createAsyncIterable<T = unknown>(listener: (ls: AsyncPushCallbacks<T>) => void): AsyncIterable<T>;
