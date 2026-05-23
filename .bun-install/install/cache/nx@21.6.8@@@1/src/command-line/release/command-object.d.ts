import { CommandModule } from 'yargs';
import { OutputStyle, RunManyOptions } from '../yargs-utils/shared-options';
import { VersionData } from './utils/shared';
export interface BaseNxReleaseArgs {
    verbose?: boolean;
    printConfig?: boolean | 'debug';
}
export interface NxReleaseArgs extends BaseNxReleaseArgs {
    groups?: string[];
    projects?: string[];
    dryRun?: boolean;
}
interface GitOptions {
    stageChanges?: boolean;
    gitCommit?: boolean;
    gitCommitMessage?: string;
    gitCommitArgs?: string | string[];
    gitTag?: boolean;
    gitTagMessage?: string;
    gitTagArgs?: string | string[];
    gitPush?: boolean;
    gitPushArgs?: string | string[];
    gitRemote?: string;
}
export type DockerVersionSchemeArgs = {
    dockerVersionScheme?: string;
    dockerVersion?: string;
};
export type VersionOptions = NxReleaseArgs & GitOptions & VersionPlanArgs & FirstReleaseArgs & DockerVersionSchemeArgs & {
    specifier?: string;
    preid?: string;
    stageChanges?: boolean;
    /**
     * @deprecated Use versionActionsOptionsOverrides instead.
     *
     * Using generatorOptionsOverrides is only valid when release.version.useLegacyVersioning is set to true.
     */
    generatorOptionsOverrides?: Record<string, unknown>;
    versionActionsOptionsOverrides?: Record<string, unknown>;
};
export type ChangelogOptions = NxReleaseArgs & GitOptions & VersionPlanArgs & FirstReleaseArgs & {
    version?: string | null;
    versionData?: VersionData;
    to?: string;
    from?: string;
    interactive?: string;
    createRelease?: false | 'github' | 'gitlab';
};
export type PublishOptions = NxReleaseArgs & Partial<RunManyOptions> & {
    outputStyle?: OutputStyle;
} & FirstReleaseArgs & {
    registry?: string;
    tag?: string;
    access?: string;
    otp?: number;
    versionData?: VersionData;
};
export type PlanOptions = NxReleaseArgs & {
    bump?: string;
    message?: string;
    onlyTouched?: boolean;
};
export type PlanCheckOptions = BaseNxReleaseArgs & {
    base?: string;
    head?: string;
    files?: string;
    uncommitted?: boolean;
    untracked?: boolean;
};
export type ReleaseOptions = NxReleaseArgs & FirstReleaseArgs & DockerVersionSchemeArgs & {
    specifier?: string;
    yes?: boolean;
    preid?: VersionOptions['preid'];
    skipPublish?: boolean;
};
export type VersionPlanArgs = {
    deleteVersionPlans?: boolean;
};
export type FirstReleaseArgs = {
    firstRelease?: boolean;
};
export declare const yargsReleaseCommand: CommandModule<Record<string, unknown>, NxReleaseArgs>;
export {};
//# sourceMappingURL=command-object.d.ts.map