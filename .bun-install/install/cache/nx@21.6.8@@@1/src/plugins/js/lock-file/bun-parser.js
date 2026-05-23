"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BunLockfileParseError = exports.BUN_TEXT_LOCK_FILE = exports.BUN_LOCK_FILE = void 0;
exports.readBunLockFile = readBunLockFile;
exports.getBunTextLockfileDependencies = getBunTextLockfileDependencies;
exports.clearCache = clearCache;
exports.getBunTextLockfileNodes = getBunTextLockfileNodes;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const semver_1 = require("semver");
const project_graph_1 = require("../../../config/project-graph");
const file_hasher_1 = require("../../../hasher/file-hasher");
const project_graph_builder_1 = require("../../../project-graph/project-graph-builder");
const json_1 = require("../../../utils/json");
const DEPENDENCY_TYPES = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
];
exports.BUN_LOCK_FILE = 'bun.lockb';
exports.BUN_TEXT_LOCK_FILE = 'bun.lock';
let currentLockFileHash;
let cachedParsedLockFile;
const keyMap = new Map();
const packageVersions = new Map();
const specParseCache = new Map();
// Structured error types for better error handling
class BunLockfileParseError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'BunLockfileParseError';
    }
}
exports.BunLockfileParseError = BunLockfileParseError;
function readBunLockFile(lockFilePath) {
    if (lockFilePath.endsWith(exports.BUN_TEXT_LOCK_FILE)) {
        return (0, node_fs_1.readFileSync)(lockFilePath, { encoding: 'utf-8' });
    }
    return (0, node_child_process_1.execSync)(`bun ${lockFilePath}`, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 10,
        windowsHide: false,
    });
}
function getBunTextLockfileDependencies(lockFileContent, lockFileHash, ctx) {
    try {
        const lockFile = parseLockFile(lockFileContent, lockFileHash);
        const dependencies = [];
        const workspacePackages = new Set(Object.keys(ctx.projects));
        if (!lockFile.workspaces || Object.keys(lockFile.workspaces).length === 0) {
            return dependencies;
        }
        // Pre-compute workspace collections for performance
        const workspacePackageNames = getWorkspacePackageNames(lockFile);
        const workspacePaths = getWorkspacePaths(lockFile);
        const packageDeps = processPackageToPackageDependencies(lockFile, ctx, workspacePackages, workspacePackageNames, workspacePaths);
        dependencies.push(...packageDeps);
        return dependencies;
    }
    catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(`Failed to get Bun lockfile dependencies: ${error.message}`);
    }
}
/** @internal */
function clearCache() {
    currentLockFileHash = undefined;
    cachedParsedLockFile = undefined;
    keyMap.clear();
    packageVersions.clear();
    specParseCache.clear();
}
// ===== UTILITY FUNCTIONS =====
function getCachedSpecInfo(resolvedSpec) {
    if (!specParseCache.has(resolvedSpec)) {
        const { name, version } = parseResolvedSpec(resolvedSpec);
        const protocol = getProtocolFromResolvedSpec(resolvedSpec);
        specParseCache.set(resolvedSpec, { name, version, protocol });
    }
    return specParseCache.get(resolvedSpec);
}
function getProtocolFromResolvedSpec(resolvedSpec) {
    // Handle scoped packages properly
    let protocolAndSpec;
    if (resolvedSpec.startsWith('@')) {
        // For scoped packages, find the second @ which separates name from protocol
        const secondAtIndex = resolvedSpec.indexOf('@', 1);
        if (secondAtIndex === -1) {
            return 'npm'; // Default fallback
        }
        protocolAndSpec = resolvedSpec.substring(secondAtIndex + 1);
    }
    else {
        // For non-scoped packages, find the first @ which separates name from protocol
        const firstAtIndex = resolvedSpec.indexOf('@');
        if (firstAtIndex === -1) {
            return 'npm'; // Default fallback
        }
        protocolAndSpec = resolvedSpec.substring(firstAtIndex + 1);
    }
    const colonIndex = protocolAndSpec.indexOf(':');
    if (colonIndex === -1) {
        return 'npm'; // No protocol specified, default to npm
    }
    return protocolAndSpec.substring(0, colonIndex);
}
function parseResolvedSpec(resolvedSpec) {
    // Handle different resolution formats:
    // - "package-name@npm:1.0.0"
    // - "@scope/package-name@npm:1.0.0"
    // - "package-name@github:user/repo#commit"
    // - "package-name@file:./path"
    // - "package-name@https://example.com/package.tgz"
    // - "alias-name@npm:actual-package@version" (ALIAS FORMAT)
    // Handle scoped packages properly - they have an extra @ at the beginning
    // Format: @scope/package@protocol:spec
    let name;
    let protocolAndSpec;
    if (resolvedSpec.startsWith('@')) {
        // For scoped packages, find the second @ which separates name from protocol
        const secondAtIndex = resolvedSpec.indexOf('@', 1);
        if (secondAtIndex === -1) {
            return { name: '', version: '' };
        }
        name = resolvedSpec.substring(0, secondAtIndex);
        protocolAndSpec = resolvedSpec.substring(secondAtIndex + 1);
    }
    else {
        // For non-scoped packages, find the first @ which separates name from protocol
        const firstAtIndex = resolvedSpec.indexOf('@');
        if (firstAtIndex === -1) {
            return { name: '', version: '' };
        }
        name = resolvedSpec.substring(0, firstAtIndex);
        protocolAndSpec = resolvedSpec.substring(firstAtIndex + 1);
    }
    // Parse protocol and spec
    const colonIndex = protocolAndSpec.indexOf(':');
    // Handle specs without protocol prefix (e.g., "package@1.0.0" instead of "package@npm:1.0.0")
    if (colonIndex === -1) {
        // No protocol specified, treat as npm package with direct version
        return { name, version: protocolAndSpec };
    }
    const protocol = protocolAndSpec.substring(0, colonIndex);
    const spec = protocolAndSpec.substring(colonIndex + 1);
    if (protocol === 'npm') {
        // For npm protocol, spec should always be in format: package@version
        // Examples:
        // - Regular: "package@npm:package@1.0.0" -> version: "1.0.0"
        // - Alias: "alias@npm:real-package@1.0.0" -> version: "npm:real-package@1.0.0"
        // Extract the package name and version from the spec
        const atIndex = spec.lastIndexOf('@');
        if (atIndex === -1) {
            // Malformed spec, return as-is
            return { name, version: spec };
        }
        const specPackageName = spec.substring(0, atIndex);
        const specVersion = spec.substring(atIndex + 1);
        if (specPackageName === name) {
            // Regular npm package: "package@npm:package@1.0.0" -> version: "1.0.0"
            return { name, version: specVersion };
        }
        else {
            // Alias package: "alias@npm:real-package@1.0.0" -> version: "npm:real-package@1.0.0"
            return { name, version: `npm:${spec}` };
        }
    }
    else if (protocol === 'workspace') {
        // Workspace dependencies use the workspace path as version
        return { name, version: `workspace:${spec}` };
    }
    else if (protocol === 'github' || protocol === 'git') {
        // Extract commit hash from GitHub/Git reference
        // Format: user/repo#commit-hash or repo-url#commit-hash
        const gitMatch = spec.match(/^(.+?)#(.+)$/);
        if (gitMatch) {
            const [, repo, commit] = gitMatch;
            return { name, version: `${protocol}:${repo}#${commit}` };
        }
        else {
            return { name, version: `${protocol}:${spec}` };
        }
    }
    else if (protocol === 'file' || protocol === 'link') {
        // File/Link dependencies use the file path as version
        return { name, version: `${protocol}:${spec}` };
    }
    else if (protocol === 'https' || protocol === 'http') {
        // Tarball dependencies use the full URL as version
        return { name, version: `${protocol}:${spec}` };
    }
    else {
        // For any other protocols, use the original spec as version
        return { name, version: resolvedSpec };
    }
}
function calculatePackageHash(packageData, lockFile, name, version) {
    const [resolvedSpec, tarballUrl, metadata, hash] = packageData;
    // For NPM packages (4 elements), use the integrity hash
    if (packageData.length === 4 && hash && typeof hash === 'string') {
        // Use better hash from manifests if available
        if (lockFile.manifests && lockFile.manifests[`${name}@${version}`]) {
            const manifest = lockFile.manifests[`${name}@${version}`];
            if (manifest.dist && manifest.dist.shasum) {
                return manifest.dist.shasum;
            }
        }
        return hash;
    }
    // For other package types, calculate hash from available data
    const hashData = [resolvedSpec];
    if (tarballUrl && typeof tarballUrl === 'string')
        hashData.push(tarballUrl);
    if (metadata)
        hashData.push(JSON.stringify(metadata));
    if (hash && typeof hash === 'string')
        hashData.push(hash);
    return (0, file_hasher_1.hashArray)(hashData);
}
/**
 * Determines if a package is an alias by comparing the package key with the resolved spec name
 * In Bun lockfiles, aliases are identified when the package key differs from the resolved package name
 */
function isAliasPackage(packageKey, resolvedPackageName) {
    return packageKey !== resolvedPackageName;
}
function parseLockFile(lockFileContent, lockFileHash) {
    if (currentLockFileHash === lockFileHash) {
        return cachedParsedLockFile;
    }
    clearCache();
    try {
        const result = (0, json_1.parseJson)(lockFileContent, {
            allowTrailingComma: true,
            expectComments: true,
        });
        // Validate basic structure
        if (!result || typeof result !== 'object') {
            throw new Error('Lockfile root must be an object');
        }
        // Validate lockfile version
        if (result.lockfileVersion !== undefined) {
            if (typeof result.lockfileVersion !== 'number') {
                throw new Error(`Lockfile version must be a number, got ${typeof result.lockfileVersion}`);
            }
            const supportedVersions = [0, 1];
            if (!supportedVersions.includes(result.lockfileVersion)) {
                throw new Error(`Unsupported lockfile version ${result.lockfileVersion}. Supported versions: ${supportedVersions.join(', ')}`);
            }
        }
        if (!result.packages || typeof result.packages !== 'object') {
            throw new Error('Lockfile packages section must be an object');
        }
        if (!result.workspaces || typeof result.workspaces !== 'object') {
            throw new Error('Lockfile workspaces section must be an object');
        }
        // Validate optional sections
        if (result.patches && typeof result.patches !== 'object') {
            throw new Error('Lockfile patches section must be an object');
        }
        if (result.manifests && typeof result.manifests !== 'object') {
            throw new Error('Lockfile manifests section must be an object');
        }
        if (result.workspacePackages &&
            typeof result.workspacePackages !== 'object') {
            throw new Error('Lockfile workspacePackages section must be an object');
        }
        // Validate structure of patches entries
        if (result.patches) {
            for (const [packageName, patchInfo] of Object.entries(result.patches)) {
                if (!patchInfo || typeof patchInfo !== 'object') {
                    throw new Error(`Invalid patch entry for package "${packageName}": must be an object`);
                }
                if (!patchInfo.path || typeof patchInfo.path !== 'string') {
                    throw new Error(`Invalid patch entry for package "${packageName}": path must be a string`);
                }
            }
        }
        // Validate structure of workspace packages entries
        if (result.workspacePackages) {
            for (const [packageName, packageInfo] of Object.entries(result.workspacePackages)) {
                if (!packageInfo || typeof packageInfo !== 'object') {
                    throw new Error(`Invalid workspace package entry for "${packageName}": must be an object`);
                }
                if (!packageInfo.name || typeof packageInfo.name !== 'string') {
                    throw new Error(`Invalid workspace package entry for "${packageName}": name must be a string`);
                }
                if (!packageInfo.version || typeof packageInfo.version !== 'string') {
                    throw new Error(`Invalid workspace package entry for "${packageName}": version must be a string`);
                }
            }
        }
        cachedParsedLockFile = result;
        currentLockFileHash = lockFileHash;
        return result;
    }
    catch (error) {
        // Handle JSON parsing errors
        if (error.message.includes('JSON') ||
            error.message.includes('InvalidSymbol')) {
            throw new BunLockfileParseError('Failed to parse Bun lockfile: Invalid JSON syntax. Please check for syntax errors or regenerate the lockfile.', error);
        }
        // Re-throw parsing errors as-is (for validation errors)
        if (error instanceof Error) {
            throw error;
        }
        // Handle unknown errors
        throw new BunLockfileParseError(`Failed to parse Bun lockfile: ${error.message}`, error);
    }
}
// ===== MAIN EXPORT FUNCTIONS =====
function getBunTextLockfileNodes(lockFileContent, lockFileHash) {
    try {
        const lockFile = parseLockFile(lockFileContent, lockFileHash);
        const nodes = {};
        const packageVersions = new Map();
        if (!lockFile.packages || Object.keys(lockFile.packages).length === 0) {
            return nodes;
        }
        // Pre-compute workspace collections for performance
        const workspacePaths = getWorkspacePaths(lockFile);
        const workspacePackageNames = getWorkspacePackageNames(lockFile);
        const packageEntries = Object.entries(lockFile.packages);
        for (const [packageKey, packageData] of packageEntries) {
            const result = processPackageEntry(packageKey, packageData, lockFile, keyMap, nodes, packageVersions);
            if (result.shouldContinue) {
                continue;
            }
        }
        createHoistedNodes(packageVersions, lockFile, keyMap, nodes, workspacePaths, workspacePackageNames);
        return nodes;
    }
    catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(`Failed to get Bun lockfile nodes: ${error.message}`);
    }
}
function processPackageEntry(packageKey, packageData, lockFile, keyMap, nodes, packageVersions) {
    try {
        if (!Array.isArray(packageData) ||
            packageData.length < 1 ||
            packageData.length > 4) {
            console.warn(`Lockfile contains invalid package entry '${packageKey}'. Try regenerating the lockfile with 'bun install --force'.\nDebug: expected 1-4 elements, got ${JSON.stringify(packageData)}`);
            return { shouldContinue: true };
        }
        const [resolvedSpec] = packageData;
        if (typeof resolvedSpec !== 'string') {
            console.warn(`Lockfile contains corrupted package entry '${packageKey}'. Try regenerating the lockfile with 'bun install --force'.\nDebug: expected string, got ${typeof resolvedSpec}`);
            return { shouldContinue: true };
        }
        const { name, version, protocol } = getCachedSpecInfo(resolvedSpec);
        if (!name || !version) {
            console.warn(`Lockfile contains unrecognized package format. Try regenerating the lockfile with 'bun install --force'.\nDebug: could not parse resolved spec '${resolvedSpec}'`);
            return { shouldContinue: true };
        }
        if (isWorkspacePackage(name, lockFile)) {
            return { shouldContinue: true };
        }
        if (lockFile.patches && lockFile.patches[name]) {
            return { shouldContinue: true };
        }
        if (protocol === 'workspace') {
            return { shouldContinue: true };
        }
        const isWorkspaceSpecific = isNestedPackageKey(packageKey, lockFile);
        if (!isWorkspaceSpecific && isAliasPackage(packageKey, name)) {
            const aliasName = packageKey;
            const actualPackageName = name;
            const actualVersion = version;
            const aliasNodeKey = `npm:${aliasName}`;
            if (!keyMap.has(aliasNodeKey)) {
                const aliasNode = {
                    type: 'npm',
                    name: aliasNodeKey,
                    data: {
                        version: `npm:${actualPackageName}@${actualVersion}`,
                        packageName: aliasName,
                        hash: calculatePackageHash(packageData, lockFile, aliasName, `npm:${actualPackageName}@${actualVersion}`),
                    },
                };
                keyMap.set(aliasNodeKey, aliasNode);
                nodes[aliasNodeKey] = aliasNode;
            }
            const targetNodeKey = `npm:${actualPackageName}@${actualVersion}`;
            if (!keyMap.has(targetNodeKey)) {
                const targetNode = {
                    type: 'npm',
                    name: targetNodeKey,
                    data: {
                        version: actualVersion,
                        packageName: actualPackageName,
                        hash: calculatePackageHash(packageData, lockFile, actualPackageName, actualVersion),
                    },
                };
                keyMap.set(targetNodeKey, targetNode);
                nodes[targetNodeKey] = targetNode;
            }
            if (!packageVersions.has(aliasName)) {
                packageVersions.set(aliasName, new Set());
            }
            packageVersions
                .get(aliasName)
                .add(`npm:${actualPackageName}@${actualVersion}`);
            if (!packageVersions.has(actualPackageName)) {
                packageVersions.set(actualPackageName, new Set());
            }
            packageVersions.get(actualPackageName).add(actualVersion);
        }
        else {
            if (!packageVersions.has(name)) {
                packageVersions.set(name, new Set());
            }
            packageVersions.get(name).add(version);
            const nodeKey = `npm:${name}@${version}`;
            if (keyMap.has(nodeKey)) {
                nodes[nodeKey] = keyMap.get(nodeKey);
                return { shouldContinue: false };
            }
            const nodeHash = calculatePackageHash(packageData, lockFile, name, version);
            const node = {
                type: 'npm',
                name: nodeKey,
                data: {
                    version,
                    packageName: name,
                    hash: nodeHash,
                },
            };
            keyMap.set(nodeKey, node);
            nodes[nodeKey] = node;
        }
        return { shouldContinue: false };
    }
    catch (error) {
        console.warn(`Unable to process package '${packageKey}'. The lockfile may be corrupted. Try regenerating with 'bun install --force'.\nDebug: ${error.message}`);
        return { shouldContinue: true };
    }
}
function isWorkspaceOrPatchedPackage(packageName, lockFile, workspacePackages, workspacePackageNames) {
    return (workspacePackages.has(packageName) ||
        workspacePackageNames.has(packageName) ||
        isWorkspacePackage(packageName, lockFile) ||
        (lockFile.patches && !!lockFile.patches[packageName]));
}
function resolveAliasTarget(versionSpec) {
    if (!versionSpec.startsWith('npm:'))
        return null;
    const actualSpec = versionSpec.substring(4);
    const actualAtIndex = actualSpec.lastIndexOf('@');
    return {
        packageName: actualSpec.substring(0, actualAtIndex),
        version: actualSpec.substring(actualAtIndex + 1),
    };
}
function getAllWorkspaceDependencies(workspace) {
    return {
        ...workspace.dependencies,
        ...workspace.devDependencies,
        ...workspace.optionalDependencies,
        ...workspace.peerDependencies,
    };
}
function processPackageToPackageDependencies(lockFile, ctx, workspacePackages, workspacePackageNames, workspacePaths) {
    const dependencies = [];
    if (!lockFile.packages || Object.keys(lockFile.packages).length === 0) {
        return dependencies;
    }
    const packageEntries = Object.entries(lockFile.packages);
    for (const [packageKey, packageData] of packageEntries) {
        try {
            const packageDeps = processPackageForDependencies(packageKey, packageData, lockFile, ctx, workspacePackages, workspacePackageNames, workspacePaths);
            dependencies.push(...packageDeps);
        }
        catch (error) {
            continue;
        }
    }
    return dependencies;
}
function processPackageForDependencies(packageKey, packageData, lockFile, ctx, workspacePackages, workspacePackageNames, workspacePaths) {
    if (isWorkspacePackage(packageKey, lockFile) ||
        isNestedPackageKey(packageKey, lockFile, workspacePaths, workspacePackageNames)) {
        return [];
    }
    if (!Array.isArray(packageData) || packageData.length < 1) {
        return [];
    }
    const [resolvedSpec] = packageData;
    if (typeof resolvedSpec !== 'string') {
        return [];
    }
    const { name: sourcePackageName, version: sourceVersion } = getCachedSpecInfo(resolvedSpec);
    if (!sourcePackageName || !sourceVersion) {
        return [];
    }
    if (lockFile.patches && lockFile.patches[sourcePackageName]) {
        return [];
    }
    const sourceNodeName = `npm:${sourcePackageName}@${sourceVersion}`;
    if (!ctx.externalNodes[sourceNodeName]) {
        return [];
    }
    const packageDependencies = extractPackageDependencies(packageData);
    if (!packageDependencies) {
        return [];
    }
    const dependencies = [];
    for (const depType of DEPENDENCY_TYPES) {
        const deps = packageDependencies[depType];
        if (!deps || typeof deps !== 'object')
            continue;
        const depDependencies = processDependencyEntries(deps, sourceNodeName, lockFile, ctx, workspacePackages, workspacePackageNames);
        dependencies.push(...depDependencies);
    }
    return dependencies;
}
function extractPackageDependencies(packageData) {
    if (packageData.length >= 3 &&
        packageData[2] &&
        typeof packageData[2] === 'object') {
        return packageData[2];
    }
    if (packageData.length >= 2 &&
        packageData[1] &&
        typeof packageData[1] === 'object') {
        return packageData[1];
    }
    return undefined;
}
function processDependencyEntries(deps, sourceNodeName, lockFile, ctx, workspacePackages, workspacePackageNames) {
    const dependencies = [];
    const depsEntries = Object.entries(deps);
    for (const [packageName, versionSpec] of depsEntries) {
        try {
            const dependency = processSingleDependency(packageName, versionSpec, sourceNodeName, lockFile, ctx, workspacePackages, workspacePackageNames);
            if (dependency) {
                dependencies.push(dependency);
            }
        }
        catch (error) {
            continue;
        }
    }
    return dependencies;
}
function processSingleDependency(packageName, versionSpec, sourceNodeName, lockFile, ctx, workspacePackages, workspacePackageNames) {
    if (typeof packageName !== 'string' || typeof versionSpec !== 'string') {
        return null;
    }
    if (isWorkspaceOrPatchedPackage(packageName, lockFile, workspacePackages, workspacePackageNames)) {
        return null;
    }
    if (versionSpec.startsWith('workspace:')) {
        return null;
    }
    let targetPackageName = packageName;
    let targetVersion = versionSpec;
    const aliasTarget = resolveAliasTarget(versionSpec);
    if (aliasTarget) {
        targetPackageName = aliasTarget.packageName;
        targetVersion = aliasTarget.version;
    }
    else {
        const resolvedVersion = findResolvedVersion(packageName, versionSpec, lockFile.packages, lockFile.manifests);
        if (!resolvedVersion) {
            return null;
        }
        targetVersion = resolvedVersion;
    }
    const targetNodeName = resolveTargetNodeName(targetPackageName, targetVersion, ctx);
    if (!targetNodeName) {
        return null;
    }
    const dependency = {
        source: sourceNodeName,
        target: targetNodeName,
        type: project_graph_1.DependencyType.static,
    };
    try {
        (0, project_graph_builder_1.validateDependency)(dependency, ctx);
        return dependency;
    }
    catch (e) {
        return null;
    }
}
function resolveTargetNodeName(targetPackageName, targetVersion, ctx) {
    const hoistedNodeName = `npm:${targetPackageName}`;
    const versionedNodeName = `npm:${targetPackageName}@${targetVersion}`;
    if (ctx.externalNodes[versionedNodeName]) {
        return versionedNodeName;
    }
    if (ctx.externalNodes[hoistedNodeName]) {
        return hoistedNodeName;
    }
    return null;
}
// ===== WORKSPACE-RELATED FUNCTIONS =====
function getWorkspacePackageNames(lockFile) {
    const workspacePackageNames = new Set();
    if (lockFile.workspacePackages) {
        for (const packageInfo of Object.values(lockFile.workspacePackages)) {
            workspacePackageNames.add(packageInfo.name);
        }
    }
    return workspacePackageNames;
}
function getWorkspacePaths(lockFile) {
    const workspacePaths = new Set();
    if (lockFile.workspaces) {
        for (const workspacePath of Object.keys(lockFile.workspaces)) {
            if (workspacePath !== '') {
                workspacePaths.add(workspacePath);
            }
        }
    }
    return workspacePaths;
}
function isWorkspacePackage(packageName, lockFile) {
    // Check if package is in workspacePackages field
    if (lockFile.workspacePackages && lockFile.workspacePackages[packageName]) {
        return true;
    }
    // Check if package is defined in any workspace dependencies with workspace: prefix
    // or if it's a file dependency in workspace dependencies
    if (lockFile.workspaces) {
        for (const workspace of Object.values(lockFile.workspaces)) {
            const allDeps = getAllWorkspaceDependencies(workspace);
            if (allDeps[packageName]?.startsWith('workspace:')) {
                return true;
            }
            // Check if this is a file dependency defined in workspace dependencies
            // Always filter out file dependencies as they represent workspace packages
            if (allDeps[packageName]?.startsWith('file:')) {
                return true;
            }
        }
    }
    // Check if package appears in packages section with workspace: or file: protocol
    if (lockFile.packages) {
        for (const packageData of Object.values(lockFile.packages)) {
            if (Array.isArray(packageData) && packageData.length > 0) {
                const resolvedSpec = packageData[0];
                if (typeof resolvedSpec === 'string') {
                    const { name, protocol } = getCachedSpecInfo(resolvedSpec);
                    if (name === packageName &&
                        (protocol === 'workspace' || protocol === 'file')) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}
// ===== HOISTING-RELATED FUNCTIONS =====
function createHoistedNodes(packageVersions, lockFile, keyMap, nodes, workspacePaths, workspacePackageNames) {
    for (const [packageName, versions] of packageVersions.entries()) {
        const hoistedNodeKey = `npm:${packageName}`;
        if (shouldCreateHoistedNode(packageName, lockFile, workspacePaths, workspacePackageNames)) {
            const hoistedVersion = getHoistedVersion(packageName, versions, lockFile);
            if (hoistedVersion) {
                const versionedNodeKey = `npm:${packageName}@${hoistedVersion}`;
                const versionedNode = keyMap.get(versionedNodeKey);
                if (versionedNode && !keyMap.has(hoistedNodeKey)) {
                    const hoistedNode = {
                        type: 'npm',
                        name: hoistedNodeKey,
                        data: {
                            version: hoistedVersion,
                            packageName: packageName,
                            hash: versionedNode.data.hash,
                        },
                    };
                    keyMap.set(hoistedNodeKey, hoistedNode);
                    nodes[hoistedNodeKey] = hoistedNode;
                }
            }
        }
    }
}
/**
 * Checks if a package key represents a workspace-specific or nested dependency entry
 * These entries should not become external nodes, they are used only for resolution
 *
 * Examples of workspace-specific/nested entries:
 * - "@quz/pkg1/lodash" (workspace-specific)
 * - "is-even/is-odd" (dependency nesting)
 * - "@quz/pkg2/is-even/is-odd" (workspace-specific nested)
 */
function isNestedPackageKey(packageKey, lockFile, workspacePaths, workspacePackageNames) {
    // If the key doesn't contain '/', it's a direct package entry
    if (!packageKey.includes('/')) {
        return false;
    }
    // Get workspace paths and package names for comparison
    const computedWorkspacePaths = workspacePaths || getWorkspacePaths(lockFile);
    const computedWorkspacePackageNames = workspacePackageNames || getWorkspacePackageNames(lockFile);
    // Check if this looks like a workspace-specific or nested entry
    const parts = packageKey.split('/');
    // For multi-part keys, check if the prefix is a workspace path or package name
    if (parts.length >= 2) {
        const prefix = parts.slice(0, -1).join('/');
        // Check against known workspace paths
        if (computedWorkspacePaths.has(prefix)) {
            return true;
        }
        // Check against workspace package names (scoped packages)
        if (computedWorkspacePackageNames.has(prefix)) {
            return true;
        }
        // Check for scoped workspace packages (e.g., "@quz/pkg1")
        if (prefix.startsWith('@') && prefix.includes('/')) {
            return true;
        }
        // This could be dependency nesting (e.g., "is-even/is-odd")
        // These should also be filtered out as they're not direct packages
        return true;
    }
    return false;
}
/**
 * Checks if a package has workspace-specific variants in the lockfile
 * Workspace-specific variants indicate the package should NOT be hoisted
 * Example: "@quz/pkg1/lodash" indicates lodash should not be hoisted for the @quz/pkg1 workspace
 *
 * This should NOT match dependency nesting like "is-even/is-odd" which represents
 * is-odd as a dependency of is-even, not a workspace-specific variant.
 */
function hasWorkspaceSpecificVariant(packageName, lockFile, workspacePaths, workspacePackageNames) {
    if (!lockFile.packages)
        return false;
    // Get list of known workspace paths to distinguish workspace-specific variants
    // from dependency nesting
    const computedWorkspacePaths = workspacePaths || getWorkspacePaths(lockFile);
    const computedWorkspacePackageNames = workspacePackageNames || getWorkspacePackageNames(lockFile);
    // Check if any package key follows pattern: "workspace/packageName"
    for (const packageKey of Object.keys(lockFile.packages)) {
        if (packageKey.includes('/') && packageKey.endsWith(`/${packageName}`)) {
            const prefix = packageKey.substring(0, packageKey.lastIndexOf(`/${packageName}`));
            // Check if prefix is a known workspace path or workspace package name
            if (computedWorkspacePaths.has(prefix) ||
                computedWorkspacePackageNames.has(prefix)) {
                return true;
            }
            // Also check for scoped workspace packages (e.g., "@quz/pkg1/lodash")
            if (prefix.startsWith('@') && prefix.includes('/')) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Determines if a package should have a hoisted node created
 * A package should be hoisted if:
 * 1. It has a direct entry in the packages section (key matches package name exactly), OR
 * 2. It appears as a direct dependency in any workspace AND no workspace-specific variants exist
 *
 * This handles both cases:
 * - Packages with direct entries (like transitive deps) should be hoisted
 * - Packages in workspace deps without conflicts should be hoisted
 * - Packages with both direct entries and workspace-specific variants get both
 */
function shouldCreateHoistedNode(packageName, lockFile, workspacePaths, workspacePackageNames) {
    if (!lockFile.workspaces || !lockFile.packages)
        return false;
    // First check if the package has a direct entry in the packages section
    // Direct entries should always be hoisted (they represent the canonical version)
    if (lockFile.packages[packageName]) {
        return true;
    }
    // For packages without direct entries, check if they appear in workspace dependencies
    // and don't have workspace-specific variants (which would cause conflicts)
    let appearsInWorkspace = false;
    for (const workspace of Object.values(lockFile.workspaces)) {
        const allDeps = getAllWorkspaceDependencies(workspace);
        if (allDeps[packageName]) {
            appearsInWorkspace = true;
            break;
        }
    }
    if (appearsInWorkspace &&
        !hasWorkspaceSpecificVariant(packageName, lockFile, workspacePaths, workspacePackageNames)) {
        return true; // Found in workspace deps and no conflicts
    }
    return false;
}
/**
 * Gets the version that should be used for a hoisted package
 * For truly hoisted packages, we look up the version from the main package entry
 */
function getHoistedVersion(packageName, availableVersions, lockFile) {
    if (!lockFile.packages)
        return null;
    // Look for the main package entry (not workspace-specific)
    const mainPackageData = lockFile.packages[packageName];
    if (mainPackageData &&
        Array.isArray(mainPackageData) &&
        mainPackageData.length > 0) {
        const resolvedSpec = mainPackageData[0];
        if (typeof resolvedSpec === 'string') {
            const { version } = getCachedSpecInfo(resolvedSpec);
            if (version && availableVersions.has(version)) {
                return version;
            }
        }
    }
    // Fallback: return the first available version
    return availableVersions.size > 0 ? Array.from(availableVersions)[0] : null;
}
/**
 * Finds the resolved version for a package given its version specification
 *
 * 1. Fast path: Check manifests for exact version match
 * 2. Scan all packages to find candidates with matching names
 * 3. Include alias packages where the target matches our package name
 * 4. Fallback: Search manifests for any matching package entries
 * 5. Use findBestVersionMatch to select the optimal version from candidates
 */
function findResolvedVersion(packageName, versionSpec, packages, manifests) {
    // Look for matching packages and collect all versions
    const candidateVersions = [];
    const packageEntries = Object.entries(packages);
    // Early manifest lookup for exact matches
    // Avoids expensive package scanning when exact version is available
    if (manifests) {
        const exactManifestKey = `${packageName}@${versionSpec}`;
        if (manifests[exactManifestKey]) {
            return versionSpec;
        }
    }
    for (const [packageKey, packageData] of packageEntries) {
        const [resolvedSpec] = packageData;
        // Skip non-string specs early
        if (typeof resolvedSpec !== 'string') {
            continue;
        }
        // Use cached spec parsing to avoid repeated string operations
        const { name, version } = getCachedSpecInfo(resolvedSpec);
        if (name === packageName) {
            // Include manifest information if available
            const manifest = manifests?.[`${name}@${version}`];
            candidateVersions.push({ version, packageKey, manifest });
            // Early termination if we find an exact version match
            if (version === versionSpec) {
                return version;
            }
        }
        // Check for alias packages where this package might be the target
        if (isAliasPackage(packageKey, name) && name === packageName) {
            // This alias points to the package we're looking for
            const manifest = manifests?.[`${name}@${version}`];
            candidateVersions.push({ version, packageKey, manifest });
            // Early termination if we find an exact version match
            if (version === versionSpec) {
                return version;
            }
        }
    }
    if (candidateVersions.length === 0) {
        // Try to find in manifests as fallback
        if (manifests) {
            const manifestKey = Object.keys(manifests).find((key) => key.startsWith(`${packageName}@`));
            if (manifestKey) {
                const manifest = manifests[manifestKey];
                const version = manifest.version;
                if (version) {
                    candidateVersions.push({
                        version,
                        packageKey: manifestKey,
                        manifest,
                    });
                }
            }
        }
        if (candidateVersions.length === 0) {
            return null;
        }
    }
    // Handle different version specification patterns with enhanced logic
    const bestMatch = findBestVersionMatch(packageName, versionSpec, candidateVersions);
    return bestMatch ? bestMatch.version : null;
}
/**
 * Find the best version match for a given version specification
 *
 * 1. Check for exact version matches first (highest priority)
 * 2. Handle union ranges (||) by recursively checking each range
 * 3. For non-semver versions (git, file, etc.), prefer exact matches or return first candidate
 * 4. For semver versions, use semver.satisfies() to find compatible versions
 */
function findBestVersionMatch(packageName, versionSpec, candidates) {
    // For exact matches, return immediately
    const exactMatch = candidates.find((c) => c.version === versionSpec);
    if (exactMatch) {
        return exactMatch;
    }
    // Handle union ranges (||)
    if (versionSpec.includes('||')) {
        const ranges = versionSpec.split('||').map((r) => r.trim());
        for (const range of ranges) {
            const match = findBestVersionMatch(packageName, range, candidates);
            if (match) {
                return match;
            }
        }
        return null;
    }
    // Handle non-semver versions (git, file, etc.)
    const nonSemverVersions = candidates.filter((c) => !c.version.match(/^\d+\.\d+\.\d+/));
    if (nonSemverVersions.length > 0) {
        // For non-semver versions, use the first match or exact match
        const nonSemverMatch = nonSemverVersions.find((c) => c.version === versionSpec);
        if (nonSemverMatch) {
            return nonSemverMatch;
        }
        // If no exact match, return the first non-semver candidate
        return nonSemverVersions[0];
    }
    // Handle semver versions
    const semverVersions = candidates.filter((c) => c.version.match(/^\d+\.\d+\.\d+/));
    if (semverVersions.length === 0) {
        return candidates[0]; // Fallback to any available version
    }
    // Find all versions that satisfy the spec
    const satisfyingVersions = semverVersions.filter((candidate) => {
        try {
            return (0, semver_1.satisfies)(candidate.version, versionSpec);
        }
        catch (error) {
            // If semver fails, fall back to string comparison
            return candidate.version === versionSpec;
        }
    });
    if (satisfyingVersions.length === 0) {
        // No satisfying versions found, return the first candidate as fallback
        return semverVersions[0];
    }
    // Return the highest satisfying version (similar to npm behavior)
    // Sort versions in descending order and return the first one
    const sortedVersions = satisfyingVersions.sort((a, b) => {
        try {
            // Use semver comparison if possible
            const aVersion = a.version.match(/^\d+\.\d+\.\d+/) ? a.version : '0.0.0';
            const bVersion = b.version.match(/^\d+\.\d+\.\d+/) ? b.version : '0.0.0';
            return aVersion.localeCompare(bVersion, undefined, {
                numeric: true,
                sensitivity: 'base',
            });
        }
        catch {
            // Fallback to string comparison
            return b.version.localeCompare(a.version);
        }
    });
    return sortedVersions[0];
}
