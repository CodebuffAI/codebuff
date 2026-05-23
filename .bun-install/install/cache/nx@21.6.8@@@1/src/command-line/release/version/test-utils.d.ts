import type { NxJsonConfiguration, NxReleaseVersionConfiguration } from '../../../config/nx-json';
import type { ProjectGraph } from '../../../config/project-graph';
import type { Tree } from '../../../generators/tree';
import { NxReleaseConfig } from '../config/config';
import { FinalConfigForProject } from './release-group-processor';
import { VersionActions } from './version-actions';
export declare function createNxReleaseConfigAndPopulateWorkspace(tree: Tree, graphDefinition: string, additionalNxReleaseConfig: Exclude<NxJsonConfiguration['release'], 'groups'>, mockResolveCurrentVersion?: any, filters?: {
    projects?: string[];
    groups?: string[];
}): Promise<{
    projectGraph: ProjectGraph;
    nxReleaseConfig: NxReleaseConfig;
    releaseGroups: import("../config/filter-release-groups").ReleaseGroupWithName[];
    releaseGroupToFilteredProjects: Map<import("../config/filter-release-groups").ReleaseGroupWithName, Set<string>>;
    filters: {
        projects?: string[];
        groups?: string[];
    };
}>;
/**
 * A non-production grade rust implementation to prove out loading multiple different versionActions in various setups
 */
interface CargoToml {
    workspace?: {
        members: string[];
    };
    package: {
        name: string;
        version: string;
    };
    dependencies?: Record<string, string | {
        version: string;
        features?: string[];
        optional?: boolean;
    }>;
    'dev-dependencies'?: Record<string, string | {
        version: string;
        features: string[];
    }>;
    [key: string]: any;
}
export declare class ExampleRustVersionActions extends VersionActions {
    validManifestFilenames: string[];
    private parseCargoToml;
    static stringifyCargoToml(cargoToml: CargoToml): string;
    static modifyCargoTable(toml: CargoToml, section: string, key: string, value: string | object | Array<any> | (() => any)): void;
    readCurrentVersionFromSourceManifest(tree: Tree): Promise<{
        currentVersion: string;
        manifestPath: string;
    }>;
    readCurrentVersionFromRegistry(tree: Tree, _currentVersionResolverMetadata: NxReleaseVersionConfiguration['currentVersionResolverMetadata']): Promise<{
        currentVersion: string;
        logText: string;
    }>;
    updateProjectVersion(tree: Tree, newVersion: string): Promise<string[]>;
    readCurrentVersionOfDependency(tree: Tree, _projectGraph: ProjectGraph, dependencyProjectName: string): Promise<{
        currentVersion: string;
        dependencyCollection: string;
    }>;
    updateProjectDependencies(tree: Tree, _projectGraph: ProjectGraph, dependenciesToUpdate: Record<string, string>): Promise<string[]>;
}
export declare class ExampleNonSemverVersionActions extends VersionActions {
    validManifestFilenames: any;
    readCurrentVersionFromSourceManifest(): Promise<any>;
    readCurrentVersionFromRegistry(): Promise<any>;
    readCurrentVersionOfDependency(): Promise<{
        currentVersion: any;
        dependencyCollection: any;
    }>;
    updateProjectVersion(tree: any, newVersion: any): Promise<any[]>;
    updateProjectDependencies(): Promise<any[]>;
    calculateNewVersion(currentVersion: string | null, newVersionInput: string, newVersionInputReason: string, newVersionInputReasonData: Record<string, unknown>, preid: string): Promise<{
        newVersion: string;
        logText: string;
    }>;
}
export declare function parseGraphDefinition(definition: string): {
    projects: any;
};
export declare function mockResolveVersionActionsForProjectImplementation(tree: Tree, releaseGroup: any, projectGraphNode: any, finalConfigForProject: FinalConfigForProject, isInProjectsToProcess: boolean): Promise<{
    versionActionsPath: string;
    versionActions: ExampleRustVersionActions;
    afterAllProjectsVersioned?: undefined;
} | {
    versionActionsPath: string;
    versionActions: ExampleNonSemverVersionActions;
    afterAllProjectsVersioned?: undefined;
} | {
    versionActionsPath: string;
    versionActions: VersionActions;
    afterAllProjectsVersioned: any;
}>;
export {};
//# sourceMappingURL=test-utils.d.ts.map