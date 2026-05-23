"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchProcess = void 0;
const batch_messages_1 = require("../batch/batch-messages");
const exit_codes_1 = require("../../utils/exit-codes");
class BatchProcess {
    constructor(childProcess, executorName) {
        this.childProcess = childProcess;
        this.executorName = executorName;
        this.exitCallbacks = [];
        this.resultsCallbacks = [];
        this.childProcess.on('message', (message) => {
            switch (message.type) {
                case batch_messages_1.BatchMessageType.CompleteBatchExecution: {
                    for (const cb of this.resultsCallbacks) {
                        cb(message.results);
                    }
                    break;
                }
                case batch_messages_1.BatchMessageType.RunTasks: {
                    break;
                }
                default: {
                    // Re-emit any non-batch messages from the task process
                    if (process.send) {
                        process.send(message);
                    }
                }
            }
        });
        this.childProcess.once('exit', (code, signal) => {
            if (code === null)
                code = (0, exit_codes_1.signalToCode)(signal);
            for (const cb of this.exitCallbacks) {
                cb(code);
            }
        });
    }
    onExit(cb) {
        this.exitCallbacks.push(cb);
    }
    onResults(cb) {
        this.resultsCallbacks.push(cb);
    }
    async getResults() {
        return Promise.race([
            new Promise((_, rej) => {
                this.onExit((code) => {
                    if (code !== 0) {
                        rej(new Error(`"${this.executorName}" exited unexpectedly with code: ${code}`));
                    }
                });
            }),
            new Promise((res) => {
                this.onResults(res);
            }),
        ]);
    }
    send(message) {
        if (this.childProcess.connected) {
            this.childProcess.send(message);
        }
    }
    kill(signal) {
        if (this.childProcess.connected) {
            this.childProcess.kill(signal);
        }
    }
}
exports.BatchProcess = BatchProcess;
