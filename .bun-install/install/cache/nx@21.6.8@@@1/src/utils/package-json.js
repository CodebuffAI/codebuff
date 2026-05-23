"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePackageGroup = normalizePackageGroup;
exports.readNxMigrateConfig = readNxMigrateConfig;
exports.buildTargetFromScript = buildTargetFromScript;
exports.getMetadataFromPackageJson = getMetadataFromPackageJson;
exports.getTagsFromPackageJson = getTagsFromPackageJson;
exports.readTargetsFromPackageJson = readTargetsFromPackageJson;
exports.readModulePackageJsonWithoutFallbacks = readModulePackageJsonWithoutFallbacks;
exports.readModulePackageJson = readModulePackageJson;
exports.installPackageToTmp = installPackageToTmp;
const fs_1 = require("fs");
const path_1 = require("path");
const project_configuration_utils_1 = require("../project-graph/utils/project-configuration-utils");
const fileutils_1 = require("./fileutils");
const installation_directory_1 = require("./installation-directory");
const package_manager_1 = require("./package-manager");
const tmp_1 = require("tmp");
const child_process_1 = require("child_process");
function normalizePackageGroup(packageGroup) {
    return Array.isArray(packageGroup)
        ? packageGroup.map((x) => typeof x === 'string' ? { package: x, version: '*' } : x)
        : Object.entries(packageGroup).map(([pkg, version]) => ({
            package: pkg,
            version,
        }));
}
function readNxMigrateConfig(json) {
    const parseNxMigrationsConfig = (fromJson) => {
        if (!fromJson) {
            return {};
        }
        if (typeof fromJson === 'string') {
            return { migrations: fromJson, packageGroup: [] };
        }
        return {
            ...(fromJson.migrations ? { migrations: fromJson.migrations } : {}),
            ...(fromJson.packageGroup
                ? { packageGroup: normalizePackageGroup(fromJson.packageGroup) }
                : {}),
        };
    };
    return {
        ...parseNxMigrationsConfig(json['ng-update']),
        ...parseNxMigrationsConfig(json['nx-migrations']),
        // In case there's a `migrations` field in `package.json`
        ...parseNxMigrationsConfig(json),
    };
}
function buildTargetFromScript(script, scripts = {}, packageManagerCommand) {
    return {
        executor: 'nx:run-script',
        options: {
            script,
        },
        metadata: {
            scriptContent: scripts[script],
            runCommand: packageManagerCommand.run(script),
        },
    };
}
let packageManagerCommand;
function getMetadataFromPackageJson(packageJson, isInPackageManagerWorkspaces) {
    const { scripts, nx, description, name, exports, main, version } = packageJson;
    const includedScripts = nx?.includedScripts || Object.keys(scripts ?? {});
    return {
        targetGroups: {
            ...(includedScripts.length ? { 'NPM Scripts': includedScripts } : {}),
        },
        description,
        js: {
            packageName: name,
            packageVersion: version,
            packageExports: exports,
            packageMain: main,
            isInPackageManagerWorkspaces,
        },
    };
}
function getTagsFromPackageJson(packageJson) {
    const tags = packageJson.private ? ['npm:private'] : ['npm:public'];
    if (packageJson.keywords?.length) {
        tags.push(...packageJson.keywords.map((k) => `npm:${k}`));
    }
    if (packageJson?.nx?.tags?.length) {
        tags.push(...packageJson?.nx.tags);
    }
    return tags;
}
function readTargetsFromPackageJson(packageJson, nxJson, projectRoot, workspaceRoot) {
    const { scripts, nx, private: isPrivate } = packageJson ?? {};
    const res = {};
    const includedScripts = nx?.includedScripts || Object.keys(scripts ?? {});
    for (const script of includedScripts) {
        packageManagerCommand ??= (0, package_manager_1.getPackageManagerCommand)();
        res[script] = buildTargetFromScript(script, scripts, packageManagerCommand);
    }
    for (const targetName in nx?.targets) {
        res[targetName] = (0, project_configuration_utils_1.mergeTargetConfigurations)(nx?.targets[targetName], res[targetName]);
    }
    /**
     * Add implicit nx-release-publish target for all package.json files that are
     * not marked as `"private": true` to allow for lightweight configuration for
     * package based repos.
     *
     * Any targetDefaults for the nx-release-publish target set by the user should
     * be merged with the implicit target.
     */
    if (!isPrivate &&
        !res['nx-release-publish'] &&
        hasNxJsPlugin(projectRoot, workspaceRoot)) {
        const nxReleasePublishTargetDefaults = nxJson?.targetDefaults?.['nx-release-publish'] ?? {};
        res['nx-release-publish'] = {
            executor: '@nx/js:release-publish',
            ...nxReleasePublishTargetDefaults,
            dependsOn: [
                // For maximum correctness, projects should only ever be published once their dependencies are successfully published
                '^nx-release-publish',
                ...(nxReleasePublishTargetDefaults.dependsOn ?? []),
            ],
            options: {
                ...(nxReleasePublishTargetDefaults.options ?? {}),
            },
        };
    }
    return res;
}
function hasNxJsPlugin(projectRoot, workspaceRoot) {
    try {
        // nx-ignore-next-line
        require.resolve('@nx/js/package.json', {
            paths: [projectRoot, ...(0, installation_directory_1.getNxRequirePaths)(workspaceRoot), __dirname],
        });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Uses `require.resolve` to read the package.json for a module.
 *
 * This will fail if the module doesn't export package.json
 *
 * @returns package json contents and path
 */
function readModulePackageJsonWithoutFallbacks(moduleSpecifier, requirePaths = (0, installation_directory_1.getNxRequirePaths)()) {
    const packageJsonPath = require.resolve(`${moduleSpecifier}/package.json`, {
        paths: requirePaths,
    });
    const packageJson = (0, fileutils_1.readJsonFile)(packageJsonPath);
    return {
        path: packageJsonPath,
        packageJson,
    };
}
/**
 * Reads the package.json file for a specified module.
 *
 * Includes a fallback that accounts for modules that don't export package.json
 *
 * @param {string} moduleSpecifier The module to look up
 * @param {string[]} requirePaths List of paths look in. Pass `module.paths` to ensure non-hoisted dependencies are found.
 *
 * @example
 * // Use the caller's lookup paths for non-hoisted dependencies
 * readModulePackageJson('http-server', module.paths);
 *
 * @returns package json contents and path
 */
function readModulePackageJson(moduleSpecifier, requirePaths = (0, installation_directory_1.getNxRequirePaths)()) {
    let packageJsonPath;
    let packageJson;
    try {
        ({ path: packageJsonPath, packageJson } =
            readModulePackageJsonWithoutFallbacks(moduleSpecifier, requirePaths));
    }
    catch {
        const entryPoint = require.resolve(moduleSpecifier, {
            paths: requirePaths,
        });
        let moduleRootPath = (0, path_1.dirname)(entryPoint);
        packageJsonPath = (0, path_1.join)(moduleRootPath, 'package.json');
        while (!(0, fs_1.existsSync)(packageJsonPath)) {
            moduleRootPath = (0, path_1.dirname)(moduleRootPath);
            packageJsonPath = (0, path_1.join)(moduleRootPath, 'package.json');
        }
        packageJson = (0, fileutils_1.readJsonFile)(packageJsonPath);
        if (packageJson.name && packageJson.name !== moduleSpecifier) {
            throw new Error(`Found module ${packageJson.name} while trying to locate ${moduleSpecifier}/package.json`);
        }
    }
    return {
        packageJson,
        path: packageJsonPath,
    };
}
function installPackageToTmp(pkg, requiredVersion) {
    const { dir: tempDir, cleanup } = (0, package_manager_1.createTempNpmDirectory)?.() ?? {
        dir: (0, tmp_1.dirSync)().name,
        cleanup: () => { },
    };
    console.log(`Fetching ${pkg}...`);
    const packageManager = (0, package_manager_1.detectPackageManager)();
    const isVerbose = process.env.NX_VERBOSE_LOGGING === 'true';
    generatePackageManagerFiles(tempDir, packageManager);
    const preInstallCommand = (0, package_manager_1.getPackageManagerCommand)(packageManager).preInstall;
    if (preInstallCommand) {
        // ensure package.json and repo in tmp folder is set to a proper package manager state
        (0, child_process_1.execSync)(preInstallCommand, {
            cwd: tempDir,
            stdio: isVerbose ? 'inherit' : 'ignore',
            windowsHide: false,
        });
    }
    const pmCommands = (0, package_manager_1.getPackageManagerCommand)(packageManager);
    let addCommand = pmCommands.addDev;
    if (packageManager === 'pnpm') {
        addCommand = 'pnpm add -D'; // we need to ensure that we are not using workspace command
    }
    (0, child_process_1.execSync)(`${addCommand} ${pkg}@${requiredVersion} ${pmCommands.ignoreScriptsFlag ?? ''}`, {
        cwd: tempDir,
        stdio: isVerbose ? 'inherit' : 'ignore',
        windowsHide: false,
    });
    return {
        tempDir,
        cleanup,
    };
}
/**
 * Generates necessary files needed for the package manager to work
 * and for the node_modules to be accessible.
 */
function generatePackageManagerFiles(root, packageManager = (0, package_manager_1.detectPackageManager)()) {
    const [pmMajor] = (0, package_manager_1.getPackageManagerVersion)(packageManager).split('.');
    switch (packageManager) {
        case 'yarn':
            if (+pmMajor >= 2) {
                (0, fs_1.writeFileSync)((0, path_1.join)(root, '.yarnrc.yml'), 'nodeLinker: node-modules\nenableScripts: false');
            }
            break;
    }
}
