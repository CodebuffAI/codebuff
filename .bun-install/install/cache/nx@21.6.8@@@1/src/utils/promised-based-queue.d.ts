export declare class PromisedBasedQueue {
    private counter;
    private promise;
    sendToQueue(fn: () => Promise<any>): Promise<any>;
    isEmpty(): boolean;
    /**
     * Used to decrement the internal counter representing the number of active promises in the queue.
     * This is useful for retrying a failed daemon message, as we want to be able to shut the daemon down
     * without marking the promise that represents the failed message as settled. To do so, we store
     * the promise in a separate variable and only resolve or reject it later.
     */
    decrementQueueCounter(): void;
}
//# sourceMappingURL=promised-based-queue.d.ts.map