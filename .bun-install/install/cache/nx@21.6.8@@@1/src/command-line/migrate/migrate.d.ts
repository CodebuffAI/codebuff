import { MigrationsJson, PackageJsonUpdateForPackage as PackageUpdate } from '../../config/misc-interfaces';
import { NxJsonConfiguration } from '../../config/nx-json';
import { FileChange } from '../../generators/tree';
import { ArrayPackageGroup, PackageJson } from '../../utils/package-json';
export interface ResolvedMigrationConfiguration extends MigrationsJson {
    packageGroup?: ArrayPackageGroup;
}
export declare function normalizeVersion(version: string): string;
export interface MigratorOptions {
    packageJson?: PackageJson;
    nxInstallation?: NxJsonConfiguration['installation'];
    getInstalledPackageVersion: (pkg: string, overrides?: Record<string, string>) => string;
    fetch: (pkg: string, version: string) => Promise<ResolvedMigrationConfiguration>;
    from: {
        [pkg: string]: string;
    };
    to: {
        [pkg: string]: string;
    };
    interactive?: boolean;
    excludeAppliedMigrations?: boolean;
}
export declare class Migrator {
    private readonly packageJson?;
    private readonly getInstalledPackageVersion;
    private readonly fetch;
    private readonly installedPkgVersionOverrides;
    private readonly to;
    private readonly interactive;
    private readonly excludeAppliedMigrations;
    private readonly packageUpdates;
    private readonly collectedVersions;
    private readonly promptAnswers;
    private readonly nxInstallation;
    private minVersionWithSkippedUpdates;
    constructor(opts: MigratorOptions);
    migrate(targetPackage: string, targetVersion: string): Promise<{
        packageUpdates: Record<string, PackageUpdate>;
        migrations: {
            package: string;
            name: string;
            version: string;
            description?: string;
            implementation?: string;
            factory?: string;
            requires?: Record<string, string>;
        }[];
        minVersionWithSkippedUpdates: string;
    }>;
    private createMigrateJson;
    private buildPackageJsonUpdates;
    private populatePackageJsonUpdatesAndGetPackagesToCheck;
    private getPackageJsonUpdatesFromMigrationConfig;
    /**
     * Mutates migrationConfig, adding package group updates into packageJsonUpdates section
     *
     * @param packageName Package which is being migrated
     * @param targetVersion Version which is being migrated to
     * @param migrationConfig Configuration which is mutated to contain package json updates
     * @returns Order of package groups
     */
    private getPackageJsonUpdatesFromPackageGroup;
    private filterPackageJsonUpdates;
    private shouldApplyPackageUpdate;
    private addPackageUpdate;
    private areRequirementsMet;
    private areIncompatiblePackagesPresent;
    private areMigrationRequirementsMet;
    private isMigrationForHigherVersionThanWhatIsInstalled;
    private wasMigrationSkipped;
    private runPackageJsonUpdatesConfirmationPrompt;
    private getPackageUpdatePromptKey;
    private getPkgVersion;
    private gt;
    private lt;
    private lte;
}
type GenerateMigrations = {
    type: 'generateMigrations';
    targetPackage: string;
    targetVersion: string;
    from: {
        [k: string]: string;
    };
    to: {
        [k: string]: string;
    };
    interactive?: boolean;
    excludeAppliedMigrations?: boolean;
};
type RunMigrations = {
    type: 'runMigrations';
    runMigrations: string;
    ifExists: boolean;
};
export declare function parseMigrationsOptions(options: {
    [k: string]: any;
}): Promise<GenerateMigrations | RunMigrations>;
export declare function executeMigrations(root: string, migrations: {
    package: string;
    name: string;
    description?: string;
    version: string;
}[], isVerbose: boolean, shouldCreateCommits: boolean, commitPrefix: string): Promise<{
    migrationsWithNoChanges: {
        package: string;
        name: string;
        description?: string;
        version: string;
    }[];
    nextSteps: string[];
}>;
export declare function runNxOrAngularMigration(root: string, migration: {
    package: string;
    name: string;
    description?: string;
    version: string;
}, isVerbose: boolean, shouldCreateCommits: boolean, commitPrefix: string, installDepsIfChanged?: () => void, handleInstallDeps?: boolean): Promise<{
    changes: FileChange[];
    nextSteps: string[];
}>;
export declare function migrate(root: string, args: {
    [k: string]: any;
}, rawArgs: string[]): Promise<number>;
export declare function runMigration(): Promise<void>;
export declare function readMigrationCollection(packageName: string, root: string): {
    collection: MigrationsJson;
    collectionPath: string;
};
export declare function getImplementationPath(collection: MigrationsJson, collectionPath: string, name: string): {
    path: string;
    fnSymbol: string;
};
export declare function nxCliPath(nxWorkspaceRoot?: string): Promise<string>;
export {};
//# sourceMappingURL=migrate.d.ts.map