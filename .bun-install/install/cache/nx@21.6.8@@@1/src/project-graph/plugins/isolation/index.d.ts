import type { PluginConfiguration } from '../../../config/nx-json';
import type { LoadedNxPlugin } from '../loaded-nx-plugin';
export declare function loadNxPluginInIsolation(plugin: PluginConfiguration, root?: string): Promise<readonly [Promise<LoadedNxPlugin>, () => void]>;
//# sourceMappingURL=index.d.ts.map