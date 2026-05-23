import type { LoadedNxPlugin } from './loaded-nx-plugin';
export declare function getPlugins(root?: string): Promise<LoadedNxPlugin[]>;
export declare function getOnlyDefaultPlugins(root?: string): Promise<LoadedNxPlugin[]>;
export declare function cleanupPlugins(): void;
//# sourceMappingURL=get-plugins.d.ts.map