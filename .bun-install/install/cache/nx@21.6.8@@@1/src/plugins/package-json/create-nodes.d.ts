import { NxJsonConfiguration } from '../../config/nx-json';
import type { ProjectConfiguration } from '../../config/workspace-json-project-json';
import { PackageJson } from '../../utils/package-json';
import { CreateNodesV2 } from '../../project-graph/plugins';
import { PackageJsonConfigurationCache } from '../../../plugins/package-json';
export declare const createNodesV2: CreateNodesV2;
export declare function buildPackageJsonWorkspacesMatcher(workspaceRoot: string, readJson: (path: string) => any): (p: string) => boolean;
export declare function createNodeFromPackageJson(pkgJsonPath: string, workspaceRoot: string, cache: PackageJsonConfigurationCache, isInPackageManagerWorkspaces: boolean): {
    projects: {
        [x: string]: ProjectConfiguration;
    };
};
export declare function buildProjectConfigurationFromPackageJson(packageJson: PackageJson, workspaceRoot: string, packageJsonPath: string, nxJson: NxJsonConfiguration, isInPackageManagerWorkspaces: boolean): ProjectConfiguration & {
    name: string;
};
/**
 * Get the package.json globs from package manager workspaces
 */
export declare function getGlobPatternsFromPackageManagerWorkspaces(root: string, readJson?: <T extends Object>(path: string) => T, readYaml?: <T extends Object>(path: string) => T, exists?: (path: string) => boolean): string[];
//# sourceMappingURL=create-nodes.d.ts.map