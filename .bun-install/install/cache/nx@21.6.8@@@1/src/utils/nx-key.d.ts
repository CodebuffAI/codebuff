import type { NxKey } from '@nx/key';
export declare function createNxKeyLicenseeInformation(nxKey: NxKey): string;
export declare function printNxKey(): Promise<void>;
export declare function getNxKeyInformation(): Promise<NxKey | null>;
export declare class NxKeyNotInstalledError extends Error {
    constructor(e: Error);
}
//# sourceMappingURL=nx-key.d.ts.map