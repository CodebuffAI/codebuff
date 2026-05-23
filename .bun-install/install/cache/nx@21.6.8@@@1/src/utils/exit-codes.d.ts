/**
 * Translates NodeJS signals to numeric exit code
 * @param signal
 */
export declare function signalToCode(signal: NodeJS.Signals | null): number;
/**
 * Translates numeric exit codes to NodeJS signals
 */
export declare function codeToSignal(code: number): NodeJS.Signals;
//# sourceMappingURL=exit-codes.d.ts.map