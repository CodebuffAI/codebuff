import { ProjectConfiguration } from '../../config/workspace-json-project-json';
import { PackageJson } from '../../utils/package-json';
import type { PluginConfiguration } from '../../config/nx-json';
import type { LoadedNxPlugin } from './loaded-nx-plugin';
export declare function readPluginPackageJson(pluginName: string, projects: Record<string, ProjectConfiguration>, paths?: string[]): {
    path: string;
    json: PackageJson;
};
export declare function loadNxPlugin(plugin: PluginConfiguration, root: string): readonly [Promise<LoadedNxPlugin>, () => void];
export declare function loadNxPluginAsync(pluginConfiguration: PluginConfiguration, paths: string[], root: string): Promise<LoadedNxPlugin>;
//# sourceMappingURL=in-process-loader.d.ts.map