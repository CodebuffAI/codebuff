"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patternsWeIgnoreInCommunityReport = exports.packagesWeCareAbout = void 0;
exports.reportHandler = reportHandler;
exports.getReportData = getReportData;
exports.findMisalignedPackagesForPackage = findMisalignedPackagesForPackage;
exports.findInstalledPowerpackPlugins = findInstalledPowerpackPlugins;
exports.findInstalledCommunityPlugins = findInstalledCommunityPlugins;
exports.findRegisteredPluginsBeingUsed = findRegisteredPluginsBeingUsed;
exports.findInstalledPackagesWeCareAbout = findInstalledPackagesWeCareAbout;
const chalk = require("chalk");
const output_1 = require("../../utils/output");
const path_1 = require("path");
const package_manager_1 = require("../../utils/package-manager");
const fileutils_1 = require("../../utils/fileutils");
const package_json_1 = require("../../utils/package-json");
const local_plugins_1 = require("../../utils/plugins/local-plugins");
const project_graph_1 = require("../../project-graph/project-graph");
const semver_1 = require("semver");
const installed_plugins_1 = require("../../utils/plugins/installed-plugins");
const installation_directory_1 = require("../../utils/installation-directory");
const nx_json_1 = require("../../config/nx-json");
const error_types_1 = require("../../project-graph/error-types");
const nx_key_1 = require("../../utils/nx-key");
const cache_1 = require("../../tasks-runner/cache");
const nxPackageJson = (0, fileutils_1.readJsonFile)((0, path_1.join)(__dirname, '../../../package.json'));
exports.packagesWeCareAbout = [
    'lerna',
    ...nxPackageJson['nx-migrations'].packageGroup.map((x) => typeof x === 'string' ? x : x.package),
    '@nrwl/schematics', // manually added since we don't publish it anymore.
    'typescript',
];
exports.patternsWeIgnoreInCommunityReport = [
    ...exports.packagesWeCareAbout,
    new RegExp('@nx/powerpack*'),
    '@schematics/angular',
    new RegExp('@angular/*'),
    '@nestjs/schematics',
];
const LINE_SEPARATOR = '---------------------------------------';
/**
 * Reports relevant version numbers for adding to an Nx issue report
 *
 * @remarks
 *
 * Must be run within an Nx workspace
 *
 */
async function reportHandler() {
    const { pm, pmVersion, nxKey, nxKeyError, localPlugins, powerpackPlugins, communityPlugins, registeredPlugins, packageVersionsWeCareAbout, outOfSyncPackageGroup, projectGraphError, nativeTarget, cache, } = await getReportData();
    const fields = [
        ['Node', process.versions.node],
        ['OS', `${process.platform}-${process.arch}`],
        ['Native Target', nativeTarget ?? 'Unavailable'],
        [pm, pmVersion],
    ];
    let padding = Math.max(...fields.map((f) => f[0].length));
    const bodyLines = fields.map(([field, value]) => `${field.padEnd(padding)}  : ${value}`);
    bodyLines.push('');
    padding =
        Math.max(...packageVersionsWeCareAbout.map((x) => x.package.length)) + 1;
    packageVersionsWeCareAbout.forEach((p) => {
        bodyLines.push(`${chalk.green(p.package.padEnd(padding))} : ${chalk.bold(p.version)}`);
    });
    if (nxKey) {
        bodyLines.push('');
        bodyLines.push(LINE_SEPARATOR);
        bodyLines.push(chalk.green('Nx key licensed packages'));
        bodyLines.push((0, nx_key_1.createNxKeyLicenseeInformation)(nxKey));
        if (nxKey.realExpiresAt || nxKey.expiresAt) {
            const licenseExpiryDate = new Date((nxKey.realExpiresAt ?? nxKey.expiresAt) * 1000);
            // license is not expired
            if (licenseExpiryDate.getTime() >= Date.now()) {
                if ('perpetualNxVersion' in nxKey) {
                    bodyLines.push(`License expires on ${licenseExpiryDate.toLocaleDateString()}, but will continue to work with Nx ${nxKey.perpetualNxVersion} and below.`);
                }
                else {
                    bodyLines.push(`License expires on ${licenseExpiryDate.toLocaleDateString()}.`);
                }
            }
            else {
                if ('perpetualNxVersion' in nxKey) {
                    bodyLines.push(`License expired on ${licenseExpiryDate.toLocaleDateString()}, but will continue to work with Nx ${nxKey.perpetualNxVersion} and below.`);
                }
                else {
                    bodyLines.push(`License expired on ${licenseExpiryDate.toLocaleDateString()}.`);
                }
            }
        }
        bodyLines.push('');
        padding =
            Math.max(...powerpackPlugins.map((powerpackPlugin) => powerpackPlugin.name.length)) + 1;
        for (const powerpackPlugin of powerpackPlugins) {
            bodyLines.push(`${chalk.green(powerpackPlugin.name.padEnd(padding))} : ${chalk.bold(powerpackPlugin.version)}`);
        }
        bodyLines.push('');
    }
    else if (nxKeyError) {
        bodyLines.push('');
        bodyLines.push(chalk.red('Nx key'));
        bodyLines.push(LINE_SEPARATOR);
        bodyLines.push(nxKeyError.message);
        bodyLines.push('');
    }
    if (registeredPlugins.length) {
        bodyLines.push(LINE_SEPARATOR);
        bodyLines.push('Registered Plugins:');
        for (const plugin of registeredPlugins) {
            bodyLines.push(`${chalk.green(plugin)}`);
        }
    }
    if (communityPlugins.length) {
        bodyLines.push(LINE_SEPARATOR);
        padding = Math.max(...communityPlugins.map((x) => x.name.length)) + 1;
        bodyLines.push('Community plugins:');
        communityPlugins.forEach((p) => {
            bodyLines.push(`${chalk.green(p.name.padEnd(padding))}: ${chalk.bold(p.version)}`);
        });
    }
    if (localPlugins.length) {
        bodyLines.push(LINE_SEPARATOR);
        bodyLines.push('Local workspace plugins:');
        for (const plugin of localPlugins) {
            bodyLines.push(`${chalk.green(plugin)}`);
        }
    }
    if (cache) {
        bodyLines.push(LINE_SEPARATOR);
        bodyLines.push(`Cache Usage: ${(0, cache_1.formatCacheSize)(cache.used)} / ${cache.max === 0 ? '∞' : (0, cache_1.formatCacheSize)(cache.max)}`);
    }
    if (outOfSyncPackageGroup) {
        bodyLines.push(LINE_SEPARATOR);
        bodyLines.push(`The following packages should match the installed version of ${outOfSyncPackageGroup.basePackage}`);
        for (const pkg of outOfSyncPackageGroup.misalignedPackages) {
            bodyLines.push(`  - ${pkg.name}@${pkg.version}`);
        }
        bodyLines.push('');
        bodyLines.push(`To fix this, run \`nx migrate ${outOfSyncPackageGroup.migrateTarget}\``);
    }
    if (projectGraphError) {
        bodyLines.push(LINE_SEPARATOR);
        bodyLines.push('⚠️ Unable to construct project graph.');
        bodyLines.push(projectGraphError.message);
        bodyLines.push(projectGraphError.stack);
    }
    output_1.output.log({
        title: 'Report complete - copy this into the issue template',
        bodyLines,
    });
}
async function getReportData() {
    const pm = (0, package_manager_1.detectPackageManager)();
    const pmVersion = (0, package_manager_1.getPackageManagerVersion)(pm);
    const { graph, error: projectGraphError } = await tryGetProjectGraph();
    const nxJson = (0, nx_json_1.readNxJson)();
    const localPlugins = await findLocalPlugins(graph, nxJson);
    const powerpackPlugins = findInstalledPowerpackPlugins();
    const communityPlugins = findInstalledCommunityPlugins();
    const registeredPlugins = findRegisteredPluginsBeingUsed(nxJson);
    const packageVersionsWeCareAbout = findInstalledPackagesWeCareAbout();
    packageVersionsWeCareAbout.unshift({
        package: 'nx',
        version: nxPackageJson.version,
    });
    if (globalThis.GLOBAL_NX_VERSION) {
        packageVersionsWeCareAbout.unshift({
            package: 'nx (global)',
            version: globalThis.GLOBAL_NX_VERSION,
        });
    }
    const outOfSyncPackageGroup = findMisalignedPackagesForPackage(nxPackageJson);
    const native = isNativeAvailable();
    let nxKey = null;
    let nxKeyError = null;
    try {
        nxKey = await (0, nx_key_1.getNxKeyInformation)();
    }
    catch (e) {
        if (!(e instanceof nx_key_1.NxKeyNotInstalledError)) {
            nxKeyError = e;
        }
    }
    let cache = (0, cache_1.dbCacheEnabled)()
        ? {
            max: (0, cache_1.resolveMaxCacheSize)(nxJson),
            used: new cache_1.DbCache({ nxCloudRemoteCache: null }).getUsedCacheSpace(),
        }
        : null;
    return {
        pm,
        nxKey,
        nxKeyError,
        powerpackPlugins,
        pmVersion,
        localPlugins,
        communityPlugins,
        registeredPlugins,
        packageVersionsWeCareAbout,
        outOfSyncPackageGroup,
        projectGraphError,
        nativeTarget: native ? native.getBinaryTarget() : null,
        cache,
    };
}
async function tryGetProjectGraph() {
    try {
        return { graph: await (0, project_graph_1.createProjectGraphAsync)() };
    }
    catch (error) {
        if (error instanceof error_types_1.ProjectGraphError) {
            return {
                graph: error.getPartialProjectGraph(),
                error: error,
            };
        }
        return {
            error,
        };
    }
}
async function findLocalPlugins(projectGraph, nxJson) {
    try {
        const localPlugins = await (0, local_plugins_1.getLocalWorkspacePlugins)((0, project_graph_1.readProjectsConfigurationFromProjectGraph)(projectGraph), nxJson);
        return Array.from(localPlugins.keys());
    }
    catch {
        return [];
    }
}
function readPackageJson(p) {
    try {
        return (0, package_json_1.readModulePackageJson)(p, (0, installation_directory_1.getNxRequirePaths)()).packageJson;
    }
    catch {
        return null;
    }
}
function readPackageVersion(p) {
    return readPackageJson(p)?.version;
}
function findMisalignedPackagesForPackage(base) {
    const misalignedPackages = [];
    let migrateTarget = base.version;
    const { packageGroup } = (0, package_json_1.readNxMigrateConfig)(base);
    for (const entry of packageGroup ?? []) {
        const { package: packageName, version } = entry;
        // should be aligned
        if (version === '*') {
            const installedVersion = readPackageVersion(packageName);
            if (installedVersion && installedVersion !== base.version) {
                if ((0, semver_1.valid)(installedVersion) && (0, semver_1.gt)(installedVersion, migrateTarget)) {
                    migrateTarget = installedVersion;
                }
                misalignedPackages.push({
                    name: packageName,
                    version: installedVersion,
                });
            }
        }
    }
    return misalignedPackages.length
        ? {
            basePackage: base.name,
            misalignedPackages,
            migrateTarget: `${base.name}@${migrateTarget}`,
        }
        : undefined;
}
function findInstalledPowerpackPlugins() {
    const installedPlugins = (0, installed_plugins_1.findInstalledPlugins)();
    return installedPlugins.filter((dep) => new RegExp('@nx/powerpack*|@nx/(.+)-cache|@nx/(conformance|owners|enterprise*)').test(dep.name));
}
function findInstalledCommunityPlugins() {
    const installedPlugins = (0, installed_plugins_1.findInstalledPlugins)();
    return installedPlugins.filter((dep) => dep.name !== 'nx' &&
        !exports.patternsWeIgnoreInCommunityReport.some((pattern) => typeof pattern === 'string'
            ? pattern === dep.name
            : pattern.test(dep.name)));
}
function findRegisteredPluginsBeingUsed(nxJson) {
    if (!nxJson.plugins) {
        return [];
    }
    return nxJson.plugins.map((plugin) => typeof plugin === 'object' ? plugin.plugin : plugin);
}
function findInstalledPackagesWeCareAbout() {
    const packagesWeMayCareAbout = {};
    // TODO (v20): Remove workaround for hiding @nrwl packages when matching @nx package is found.
    for (const pkg of exports.packagesWeCareAbout) {
        const v = readPackageVersion(pkg);
        if (v) {
            packagesWeMayCareAbout[pkg] = v;
        }
    }
    return Object.entries(packagesWeMayCareAbout).map(([pkg, version]) => ({
        package: pkg,
        version,
    }));
}
function isNativeAvailable() {
    try {
        return require('../../native');
    }
    catch {
        return false;
    }
}
