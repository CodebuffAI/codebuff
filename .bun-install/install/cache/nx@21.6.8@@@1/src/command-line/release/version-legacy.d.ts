import { NxJsonConfiguration, NxReleaseConfiguration } from '../../config/nx-json';
import { ProjectGraph, ProjectGraphProjectNode } from '../../config/project-graph';
import { VersionOptions } from './command-object';
import { NxReleaseConfig } from './config/config';
import { ReleaseGroupWithName } from './config/filter-release-groups';
import type { ReleaseVersionGeneratorResult, VersionData } from './utils/shared-legacy';
import { NxReleaseVersionResult } from './version';
export { deriveNewSemverVersion } from './utils/semver';
export type { ReleaseVersionGeneratorResult, VersionData };
export declare const validReleaseVersionPrefixes: readonly ["auto", "", "~", "^", "="];
export interface ReleaseVersionGeneratorSchema {
    projects: ProjectGraphProjectNode[];
    releaseGroup: ReleaseGroupWithName;
    projectGraph: ProjectGraph;
    specifier?: string;
    specifierSource?: 'prompt' | 'conventional-commits' | 'version-plans';
    preid?: string;
    packageRoot?: string;
    currentVersionResolver?: 'registry' | 'disk' | 'git-tag';
    currentVersionResolverMetadata?: Record<string, unknown>;
    fallbackCurrentVersionResolver?: 'disk';
    firstRelease?: boolean;
    versionPrefix?: (typeof validReleaseVersionPrefixes)[number];
    skipLockFileUpdate?: boolean;
    installArgs?: string;
    installIgnoreScripts?: boolean;
    conventionalCommitsConfig?: NxReleaseConfig['conventionalCommits'];
    deleteVersionPlans?: boolean;
    /**
     * 'auto' is the default and will cause dependents to be updated (a patch version bump) when a dependency is versioned.
     * This is only applicable to independently released projects. 'never' will cause dependents to not be updated.
     */
    updateDependents?: 'auto' | 'never';
    /**
     * Whether or not to completely omit project logs when that project has no applicable changes. This can be useful for
     * large monorepos which have a large number of projects, especially when only a subset are released together.
     */
    logUnchangedProjects?: boolean;
    /**
     * Whether or not to keep local dependency protocols (e.g. file:, workspace:) when updating dependencies in
     * package.json files. This is `false` by default as not all package managers support publishing with these protocols
     * still present in the package.json.
     */
    preserveLocalDependencyProtocols?: boolean;
}
export declare function releaseVersionLegacy(projectGraph: ProjectGraph, args: VersionOptions, nxJson: NxJsonConfiguration, nxReleaseConfig: NxReleaseConfig, userProvidedReleaseConfig: NxReleaseConfiguration): Promise<NxReleaseVersionResult>;
//# sourceMappingURL=version-legacy.d.ts.map