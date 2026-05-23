import { BatchResults } from '../batch/batch-messages';
import { ChildProcess, Serializable } from 'child_process';
export declare class BatchProcess {
    private childProcess;
    private executorName;
    private exitCallbacks;
    private resultsCallbacks;
    constructor(childProcess: ChildProcess, executorName: string);
    onExit(cb: (code: number) => void): void;
    onResults(cb: (results: BatchResults) => void): void;
    getResults(): Promise<BatchResults>;
    send(message: Serializable): void;
    kill(signal?: NodeJS.Signals): void;
}
//# sourceMappingURL=batch-process.d.ts.map