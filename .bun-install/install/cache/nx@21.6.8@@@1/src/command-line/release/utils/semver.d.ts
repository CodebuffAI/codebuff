/**
 * Special thanks to changelogen for the original inspiration for many of these utilities:
 * https://github.com/unjs/changelogen
 */
import { ReleaseType } from 'semver';
import { NxReleaseConfig } from '../config/config';
import { GitCommit } from './git';
export declare function isRelativeVersionKeyword(val: string): val is ReleaseType;
export declare function isValidSemverSpecifier(specifier: string): boolean;
/**
 * TODO: We would be able to make the logging for the conventional commits use-case
 * for fixed release groups more clear/precise if we passed through which project
 * the conventional commits were detected for.
 *
 * It would then flow up through deriveSpecifierFromConventionalCommits back to
 * ReleaseGroupProcessor.
 */
export declare function determineSemverChange(commits: GitCommit[], config: NxReleaseConfig['conventionalCommits']): 'patch' | 'minor' | 'major' | null;
export declare function deriveNewSemverVersion(currentSemverVersion: string, semverSpecifier: string, preid?: string): string;
//# sourceMappingURL=semver.d.ts.map