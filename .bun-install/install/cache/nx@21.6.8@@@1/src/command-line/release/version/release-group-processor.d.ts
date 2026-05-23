import { ManifestRootToUpdate, NxReleaseDockerConfiguration, NxReleaseVersionConfiguration } from '../../../config/nx-json';
import { ProjectGraph } from '../../../config/project-graph';
import { Tree } from '../../../generators/tree';
import { type NxReleaseConfig } from '../config/config';
import type { ReleaseGroupWithName } from '../config/filter-release-groups';
import type { VersionData } from '../utils/shared';
/**
 * The final configuration for a project after applying release group and project level overrides,
 * as well as default values. This will be passed to the relevant version actions implementation,
 * and referenced throughout the versioning process.
 */
export interface FinalConfigForProject {
    specifierSource: NxReleaseVersionConfiguration['specifierSource'];
    currentVersionResolver: NxReleaseVersionConfiguration['currentVersionResolver'];
    currentVersionResolverMetadata: NxReleaseVersionConfiguration['currentVersionResolverMetadata'];
    fallbackCurrentVersionResolver: NxReleaseVersionConfiguration['fallbackCurrentVersionResolver'];
    versionPrefix: NxReleaseVersionConfiguration['versionPrefix'];
    preserveLocalDependencyProtocols: NxReleaseVersionConfiguration['preserveLocalDependencyProtocols'];
    preserveMatchingDependencyRanges: NxReleaseVersionConfiguration['preserveMatchingDependencyRanges'];
    versionActionsOptions: NxReleaseVersionConfiguration['versionActionsOptions'];
    manifestRootsToUpdate: Array<Exclude<ManifestRootToUpdate, string>>;
    dockerOptions: NxReleaseDockerConfiguration & {
        groupPreVersionCommand?: string;
    };
}
export declare const BUMP_TYPE_REASON_TEXT: {
    readonly DEPENDENCY_WAS_BUMPED: ", because a dependency was bumped, ";
    readonly USER_SPECIFIER: ", from the given specifier, ";
    readonly PROMPTED_USER_SPECIFIER: ", from the prompted specifier, ";
    readonly CONVENTIONAL_COMMITS: ", derived from conventional commits data, ";
    readonly VERSION_PLANS: ", read from version plan {versionPlanPath}, ";
    readonly DEPENDENCY_ACROSS_GROUPS_WAS_BUMPED: ", because a dependency project belonging to another release group was bumped, ";
    readonly OTHER_PROJECT_IN_FIXED_GROUP_WAS_BUMPED_DUE_TO_DEPENDENCY: ", because of a dependency-only bump to another project in the same fixed release group, ";
    readonly NOOP_VERSION_ACTIONS: ", because this project uses docker and has been configured to skip VersionActions, ";
};
interface ReleaseGroupProcessorOptions {
    dryRun: boolean;
    verbose: boolean;
    firstRelease: boolean;
    preid: string;
    userGivenSpecifier?: string;
    projectsToProcess?: string[];
    /**
     * The optional results of applying the --project or --group filters.
     * These will be empty if there is no filtering, or contain the subset of projects or groups that
     * are being versioned if one of the (mutually exclusive) filters is set.
     */
    filters: {
        projects?: string[];
        groups?: string[];
    };
    versionActionsOptionsOverrides?: Record<string, unknown>;
}
export declare class ReleaseGroupProcessor {
    private tree;
    private projectGraph;
    private nxReleaseConfig;
    private releaseGroups;
    private releaseGroupToFilteredProjects;
    private options;
    /**
     * Stores the relationships between release groups, including their dependencies
     * and dependents. This is used for determining processing order and propagating
     * version changes between related groups.
     */
    private groupGraph;
    /**
     * Tracks which release groups have already been processed to avoid
     * processing them multiple times. Used during the group traversal.
     */
    private processedGroups;
    /**
     * Keeps track of which projects have already had their versions bumped.
     * This is used to avoid redundant version bumping and to determine which
     * projects need their dependencies updated.
     */
    private bumpedProjects;
    /**
     * Cache of release groups sorted in topological order to ensure dependencies
     * are processed before dependents. Computed once and reused throughout processing.
     */
    private sortedReleaseGroups;
    /**
     * Maps each release group to its projects sorted in topological order.
     * Ensures projects are processed after their dependencies within each group.
     */
    private sortedProjects;
    /**
     * Track the unique afterAllProjectsVersioned functions involved in the current versioning process,
     * so that we can ensure they are only invoked once per versioning execution.
     */
    private uniqueAfterAllProjectsVersioned;
    /**
     * Track the versionActions for each project so that we can invoke certain instance methods.
     */
    private projectsToVersionActions;
    /**
     * versionData that will ultimately be returned to the nx release version handler by getVersionData()
     */
    private versionData;
    /**
     * Set of all projects that are configured in the nx release config.
     * Used to validate dependencies and identify projects that should be updated.
     */
    private allProjectsConfiguredForNxRelease;
    /**
     * Set of projects that will be processed in the current run.
     * This is potentially a subset of allProjectsConfiguredForNxRelease based on filters
     * and dependency relationships.
     */
    private allProjectsToProcess;
    /**
     * If the user provided a specifier at the time of versioning we store it here so that it can take priority
     * over any configuration.
     */
    private userGivenSpecifier;
    /**
     * Caches the current version of each project to avoid repeated disk/registry/git tag lookups.
     * Often used during new version calculation. Will be null if the current version resolver is set to 'none'.
     */
    private cachedCurrentVersions;
    /**
     * Caches git tag information for projects that resolve their version from git tags.
     * This avoids performing expensive git operations multiple times for the same project.
     */
    private cachedLatestMatchingGitTag;
    /**
     * Temporary storage for dependent project names while building the dependency graph.
     * This is used as an intermediate step before creating the full dependent projects data.
     */
    private tmpCachedDependentProjects;
    /**
     * Resolve the data regarding dependent projects for each project upfront so that it remains accurate
     * even after updates are applied to manifests.
     */
    private originalDependentProjectsPerProject;
    /**
     * In the case of fixed release groups that are configured to resolve the current version from a registry
     * or a git tag, it would be a waste of time and resources to resolve the current version for each individual
     * project, therefore we maintain a cache of the current version for each applicable fixed release group here.
     */
    private currentVersionsPerFixedReleaseGroup;
    /**
     * Cache of project loggers for each project.
     */
    private projectLoggers;
    /**
     * Track any version plan files that have been processed so that we can delete them after versioning is complete,
     * while leaving any unprocessed files in place.
     */
    private processedVersionPlanFiles;
    /**
     * Certain configuration options can be overridden at the project level, and otherwise fall back to the release group level.
     * Many also have a specific default value if nothing is set at either level. To avoid applying this hierarchy for each project
     * every time such a configuration option is needed, we cache the result per project here.
     */
    private finalConfigsByProject;
    /**
     * Maps each project to its release group for quick O(1) lookups.
     * This avoids having to scan through all release groups to find a project.
     */
    private projectToReleaseGroup;
    /**
     * Maps each project to its dependents (projects that depend on it).
     * This is the inverse of the projectToDependencies map and enables
     * efficient lookup of dependent projects for propagating version changes.
     */
    private projectToDependents;
    /**
     * Maps each project to its dependencies (projects it depends on).
     * Used for building dependency graphs and determining processing order.
     */
    private projectToDependencies;
    /**
     * Caches the updateDependents setting for each project to avoid repeated
     * lookups and calculations. This determines if dependent projects should
     * be automatically updated when a dependency changes.
     */
    private projectToUpdateDependentsSetting;
    constructor(tree: Tree, projectGraph: ProjectGraph, nxReleaseConfig: NxReleaseConfig, releaseGroups: ReleaseGroupWithName[], releaseGroupToFilteredProjects: Map<ReleaseGroupWithName, Set<string>>, options: ReleaseGroupProcessorOptions);
    /**
     * Initialize the processor by building the group graph and preparing for processing.
     * This method must be called before processGroups().
     */
    init(): Promise<void>;
    /**
     * Setup mapping from project to release group and cache updateDependents settings
     */
    private setupProjectReleaseGroupMapping;
    /**
     * Determine which projects should be processed and resolve their version actions
     */
    private setupProjectsToProcess;
    /**
     * Find all dependents that should be processed due to dependency updates
     */
    private findDependentsToProcess;
    private buildGroupDependencyGraph;
    private populateDependentProjectsData;
    getReleaseGroupNameForProject(projectName: string): string | null;
    getNextGroup(): string | null;
    processGroups(): Promise<string[]>;
    flushAllProjectLoggers(): void;
    deleteProcessedVersionPlanFiles(): void;
    getVersionData(): VersionData;
    /**
     * Invoke the afterAllProjectsVersioned functions for each unique versionActions type.
     * This can be useful for performing actions like updating a workspace level lock file.
     *
     * Because the tree has already been flushed to disk at this point, each afterAllProjectsVersioned
     * function is responsible for returning the list of changed and deleted files that it affected.
     *
     * The root level `release.version.versionActionsOptions` is what is passed in here because this
     * is a one time action for the whole workspace. Release group and project level overrides are
     * not applicable.
     */
    afterAllProjectsVersioned(rootVersionActionsOptions: Record<string, unknown>): Promise<{
        changedFiles: string[];
        deletedFiles: string[];
    }>;
    processDockerProjects(dockerVersionScheme?: string, dockerVersion?: string): Promise<void>;
    private processGroup;
    private bumpVersions;
    private bumpFixedVersionGroup;
    private bumpIndependentVersionGroup;
    private determineVersionBumpForProject;
    private getVersionActionsForProject;
    private getFinalConfigForProject;
    private getProjectLoggerForProject;
    private getCurrentCachedVersionForProject;
    private getCachedFinalConfigForProject;
    /**
     * Apply project and release group precedence and default values, as well as validate the final configuration,
     * ready to be cached.
     */
    private resolveFinalConfigForProject;
    private calculateNewVersion;
    private updateDependenciesForProject;
    private bumpVersionForProject;
    private updateDependenciesForDependents;
    private getOriginalDependentProjects;
    private getFixedReleaseGroupBumpType;
    private determineSideEffectBump;
    private getProjectDependents;
    private getAllNonImplicitDependents;
    private getNonImplicitDependentsForProject;
    private hasAutoUpdateDependents;
    private topologicallySortReleaseGroups;
    private topologicallySortProjects;
    /**
     * Precompute project -> dependents/dependencies relationships for O(1) lookups
     */
    private precomputeDependencyRelationships;
    private getProjectDependencies;
}
export {};
//# sourceMappingURL=release-group-processor.d.ts.map