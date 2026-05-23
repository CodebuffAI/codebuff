import { NxReleaseConfiguration } from '../../config/nx-json';
import { ChangelogOptions } from './command-object';
import { Reference } from './utils/git';
import { ReleaseVersion } from './utils/shared';
export interface NxReleaseChangelogResult {
    workspaceChangelog?: {
        releaseVersion: ReleaseVersion;
        contents: string;
        postGitTask: PostGitTask | null;
    };
    projectChangelogs?: {
        [projectName: string]: {
            releaseVersion: ReleaseVersion;
            contents: string;
            postGitTask: PostGitTask | null;
        };
    };
}
export interface ChangelogChange {
    type: string;
    scope: string;
    description: string;
    affectedProjects: string[] | '*';
    body?: string;
    isBreaking?: boolean;
    githubReferences?: Reference[];
    authors?: {
        name: string;
        email: string;
    }[];
    shortHash?: string;
    revertedHashes?: string[];
}
export type PostGitTask = (latestCommit: string) => Promise<void>;
export declare const releaseChangelogCLIHandler: (args: ChangelogOptions) => Promise<number>;
export declare function createAPI(overrideReleaseConfig: NxReleaseConfiguration): (args: ChangelogOptions) => Promise<NxReleaseChangelogResult>;
//# sourceMappingURL=changelog.d.ts.map