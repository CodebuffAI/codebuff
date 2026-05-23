"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAsyncIterable = createAsyncIterable;
function createAsyncIterable(listener) {
    let done = false;
    let error = null;
    let cleanup;
    const pushQueue = [];
    const pullQueue = [];
    return {
        [Symbol.asyncIterator]() {
            listener({
                next: (value) => {
                    if (done || error)
                        return;
                    if (pullQueue.length > 0) {
                        pullQueue.shift()?.[0]({ value, done: false });
                    }
                    else {
                        pushQueue.push(value);
                    }
                },
                error: (err) => {
                    if (done || error)
                        return;
                    if (pullQueue.length > 0) {
                        pullQueue.shift()?.[1](err);
                    }
                    error = err;
                },
                done: () => {
                    if (pullQueue.length > 0) {
                        pullQueue.shift()?.[0]({ value: undefined, done: true });
                    }
                    done = true;
                },
                registerCleanup: (cb) => {
                    cleanup = cb;
                },
            });
            return {
                next() {
                    return new Promise((resolve, reject) => {
                        if (pushQueue.length > 0) {
                            resolve({ value: pushQueue.shift(), done: false });
                        }
                        else if (done) {
                            resolve({ value: undefined, done: true });
                        }
                        else if (error) {
                            reject(error);
                        }
                        else {
                            pullQueue.push([resolve, reject]);
                        }
                    });
                },
                async return() {
                    if (cleanup) {
                        await cleanup();
                    }
                    return { value: undefined, done: true };
                },
            };
        },
    };
}
