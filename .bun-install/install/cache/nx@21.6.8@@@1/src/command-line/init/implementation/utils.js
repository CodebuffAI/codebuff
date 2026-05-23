"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNxJsonFile = createNxJsonFile;
exports.createNxJsonFromTurboJson = createNxJsonFromTurboJson;
exports.addDepsToPackageJson = addDepsToPackageJson;
exports.updateGitIgnore = updateGitIgnore;
exports.runInstall = runInstall;
exports.initCloud = initCloud;
exports.addVsCodeRecommendedExtensions = addVsCodeRecommendedExtensions;
exports.markRootPackageJsonAsNxProjectLegacy = markRootPackageJsonAsNxProjectLegacy;
exports.markPackageJsonAsNxProject = markPackageJsonAsNxProject;
exports.printFinalMessage = printFinalMessage;
exports.isMonorepo = isMonorepo;
exports.isCRA = isCRA;
const child_process_1 = require("child_process");
const path_1 = require("path");
const fileutils_1 = require("../../../utils/fileutils");
const output_1 = require("../../../utils/output");
const package_manager_1 = require("../../../utils/package-manager");
const path_2 = require("../../../utils/path");
const versions_1 = require("../../../utils/versions");
const fs_1 = require("fs");
const connect_to_nx_cloud_1 = require("../../../nx-cloud/generators/connect-to-nx-cloud/connect-to-nx-cloud");
const connect_to_nx_cloud_2 = require("../../nx-cloud/connect/connect-to-nx-cloud");
const deduce_default_base_1 = require("./deduce-default-base");
function createNxJsonFile(repoRoot, topologicalTargets, cacheableOperations, scriptOutputs) {
    const nxJsonPath = (0, path_2.joinPathFragments)(repoRoot, 'nx.json');
    let nxJson = {};
    try {
        nxJson = (0, fileutils_1.readJsonFile)(nxJsonPath);
        // eslint-disable-next-line no-empty
    }
    catch { }
    nxJson.$schema = './node_modules/nx/schemas/nx-schema.json';
    nxJson.targetDefaults ??= {};
    if (topologicalTargets.length > 0) {
        for (const scriptName of topologicalTargets) {
            nxJson.targetDefaults[scriptName] ??= {};
            nxJson.targetDefaults[scriptName] = { dependsOn: [`^${scriptName}`] };
        }
    }
    for (const [scriptName, output] of Object.entries(scriptOutputs)) {
        if (!output) {
            // eslint-disable-next-line no-continue
            continue;
        }
        nxJson.targetDefaults[scriptName] ??= {};
        nxJson.targetDefaults[scriptName].outputs = [`{projectRoot}/${output}`];
    }
    for (const target of cacheableOperations) {
        nxJson.targetDefaults[target] ??= {};
        nxJson.targetDefaults[target].cache ??= true;
    }
    if (Object.keys(nxJson.targetDefaults).length === 0) {
        delete nxJson.targetDefaults;
    }
    const defaultBase = (0, deduce_default_base_1.deduceDefaultBase)();
    // Do not add defaultBase if it is inferred to be the Nx default value of main
    if (defaultBase !== 'main') {
        nxJson.defaultBase ??= defaultBase;
    }
    (0, fileutils_1.writeJsonFile)(nxJsonPath, nxJson);
}
function createNxJsonFromTurboJson(turboJson) {
    const nxJson = {
        $schema: './node_modules/nx/schemas/nx-schema.json',
    };
    // Handle global dependencies
    if (turboJson.globalDependencies?.length > 0) {
        nxJson.namedInputs = {
            sharedGlobals: turboJson.globalDependencies.map((dep) => `{workspaceRoot}/${dep}`),
            default: ['{projectRoot}/**/*', 'sharedGlobals'],
        };
    }
    // Handle global env vars
    if (turboJson.globalEnv?.length > 0) {
        nxJson.namedInputs = nxJson.namedInputs || {};
        nxJson.namedInputs.sharedGlobals = nxJson.namedInputs.sharedGlobals || [];
        nxJson.namedInputs.sharedGlobals.push(...turboJson.globalEnv.map((env) => ({ env })));
        nxJson.namedInputs.default = nxJson.namedInputs.default || [];
        if (!nxJson.namedInputs.default.includes('{projectRoot}/**/*')) {
            nxJson.namedInputs.default.push('{projectRoot}/**/*');
        }
        if (!nxJson.namedInputs.default.includes('sharedGlobals')) {
            nxJson.namedInputs.default.push('sharedGlobals');
        }
    }
    // Handle task configurations
    if (turboJson.tasks) {
        nxJson.targetDefaults = {};
        for (const [taskName, taskConfig] of Object.entries(turboJson.tasks)) {
            // Skip project-specific tasks (containing #)
            if (taskName.includes('#'))
                continue;
            const config = taskConfig;
            nxJson.targetDefaults[taskName] = {};
            // Handle dependsOn
            if (config.dependsOn?.length > 0) {
                nxJson.targetDefaults[taskName].dependsOn = config.dependsOn;
            }
            // Handle inputs
            if (config.inputs?.length > 0) {
                nxJson.targetDefaults[taskName].inputs = config.inputs
                    .map((input) => {
                    if (input === '$TURBO_DEFAULT$') {
                        return '{projectRoot}/**/*';
                    }
                    // Don't add projectRoot if it's already there or if it's an env var
                    if (input.startsWith('{projectRoot}/') ||
                        input.startsWith('{env.') ||
                        input.startsWith('$'))
                        return input;
                    return `{projectRoot}/${input}`;
                })
                    .map((input) => {
                    // Don't add projectRoot if it's already there or if it's an env var
                    if (input.startsWith('{projectRoot}/') ||
                        input.startsWith('{env.') ||
                        input.startsWith('$'))
                        return input;
                    return `{projectRoot}/${input}`;
                });
            }
            // Handle outputs
            if (config.outputs?.length > 0) {
                nxJson.targetDefaults[taskName].outputs = config.outputs.map((output) => {
                    // Don't add projectRoot if it's already there
                    if (output.startsWith('{projectRoot}/'))
                        return output;
                    // Handle negated patterns by adding projectRoot after the !
                    if (output.startsWith('!')) {
                        return `!{projectRoot}/${output.slice(1)}`;
                    }
                    return `{projectRoot}/${output}`;
                });
            }
            // Handle cache setting - true by default in Turbo
            nxJson.targetDefaults[taskName].cache = config.cache !== false;
        }
    }
    /**
     * The fact that cacheDir was in use suggests the user had a reason for deviating from the default.
     * We can't know what that reason was, nor if it would still be applicable in Nx, but we can at least
     * improve discoverability of the relevant Nx option by explicitly including it with its default value.
     */
    if (turboJson.cacheDir) {
        nxJson.cacheDirectory = '.nx/cache';
    }
    const defaultBase = (0, deduce_default_base_1.deduceDefaultBase)();
    // Do not add defaultBase if it is inferred to be the Nx default value of main
    if (defaultBase !== 'main') {
        nxJson.defaultBase ??= defaultBase;
    }
    return nxJson;
}
function addDepsToPackageJson(repoRoot, additionalPackages) {
    const path = (0, path_2.joinPathFragments)(repoRoot, `package.json`);
    const json = (0, fileutils_1.readJsonFile)(path);
    if (!json.devDependencies)
        json.devDependencies = {};
    json.devDependencies['nx'] = versions_1.nxVersion;
    if (additionalPackages) {
        for (const p of additionalPackages) {
            json.devDependencies[p] = versions_1.nxVersion;
        }
    }
    (0, fileutils_1.writeJsonFile)(path, json);
}
function updateGitIgnore(root) {
    const ignorePath = (0, path_1.join)(root, '.gitignore');
    try {
        let contents = (0, fs_1.readFileSync)(ignorePath, 'utf-8');
        const lines = contents.split('\n');
        let sepIncluded = false;
        if (!contents.includes('.nx/cache')) {
            if (!sepIncluded) {
                lines.push('\n');
                sepIncluded = true;
            }
            lines.push('.nx/cache');
        }
        if (!contents.includes('.nx/workspace-data')) {
            if (!sepIncluded) {
                lines.push('\n');
                sepIncluded = true;
            }
            lines.push('.nx/workspace-data');
        }
        if (!contents.includes('.cursor/rules/nx-rules.mdc')) {
            if (!sepIncluded) {
                lines.push('\n');
                sepIncluded = true;
            }
            lines.push('.cursor/rules/nx-rules.mdc');
        }
        if (!contents.includes('.github/instructions/nx.instructions.md')) {
            if (!sepIncluded) {
                lines.push('\n');
                sepIncluded = true;
            }
            lines.push('.github/instructions/nx.instructions.md');
        }
        (0, fs_1.writeFileSync)(ignorePath, lines.join('\n'), 'utf-8');
    }
    catch { }
}
function runInstall(repoRoot, pmc = (0, package_manager_1.getPackageManagerCommand)()) {
    (0, child_process_1.execSync)(pmc.install, {
        stdio: [0, 1, 2],
        cwd: repoRoot,
        windowsHide: false,
    });
}
async function initCloud(installationSource) {
    const token = await (0, connect_to_nx_cloud_2.connectWorkspaceToCloud)({
        installationSource,
    });
    await (0, connect_to_nx_cloud_1.printSuccessMessage)(token, installationSource);
}
function addVsCodeRecommendedExtensions(repoRoot, extensions) {
    const vsCodeExtensionsPath = (0, path_1.join)(repoRoot, '.vscode/extensions.json');
    if ((0, fileutils_1.fileExists)(vsCodeExtensionsPath)) {
        const vsCodeExtensionsJson = (0, fileutils_1.readJsonFile)(vsCodeExtensionsPath);
        vsCodeExtensionsJson.recommendations ??= [];
        extensions.forEach((extension) => {
            if (!vsCodeExtensionsJson.recommendations.includes(extension)) {
                vsCodeExtensionsJson.recommendations.push(extension);
            }
        });
        (0, fileutils_1.writeJsonFile)(vsCodeExtensionsPath, vsCodeExtensionsJson);
    }
    else {
        (0, fileutils_1.writeJsonFile)(vsCodeExtensionsPath, { recommendations: extensions });
    }
}
function markRootPackageJsonAsNxProjectLegacy(repoRoot, cacheableScripts, pmc) {
    const json = (0, fileutils_1.readJsonFile)((0, path_2.joinPathFragments)(repoRoot, `package.json`));
    json.nx = {};
    for (let script of cacheableScripts) {
        const scriptDefinition = json.scripts[script];
        if (!scriptDefinition) {
            continue;
        }
        if (scriptDefinition.includes('&&') || scriptDefinition.includes('||')) {
            let backingScriptName = `_${script}`;
            json.scripts[backingScriptName] = scriptDefinition;
            json.scripts[script] = `nx exec -- ${pmc.run(backingScriptName, '')}`;
        }
        else {
            json.scripts[script] = `nx exec -- ${json.scripts[script]}`;
        }
    }
    (0, fileutils_1.writeJsonFile)(`package.json`, json);
}
function markPackageJsonAsNxProject(packageJsonPath) {
    const json = (0, fileutils_1.readJsonFile)(packageJsonPath);
    if (!json.scripts) {
        return;
    }
    json.nx = {};
    (0, fileutils_1.writeJsonFile)(packageJsonPath, json);
}
function printFinalMessage({ learnMoreLink, appendLines, }) {
    output_1.output.success({
        title: '🎉 Done!',
        bodyLines: [
            `- Learn more about what to do next at ${learnMoreLink ?? 'https://nx.dev/getting-started/adding-to-existing'}`,
            ...(appendLines ?? []),
        ].filter(Boolean),
    });
}
function isMonorepo(packageJson) {
    if (!!packageJson.workspaces)
        return true;
    try {
        const content = (0, fs_1.readFileSync)('pnpm-workspace.yaml', 'utf-8');
        const { load } = require('@zkochan/js-yaml');
        const { packages } = load(content) ?? {};
        if (packages) {
            return true;
        }
    }
    catch { }
    if ((0, fs_1.existsSync)('lerna.json'))
        return true;
    return false;
}
function isCRA(packageJson) {
    const combinedDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
    };
    return (
    // Required dependencies for CRA projects
    combinedDependencies['react'] &&
        combinedDependencies['react-dom'] &&
        combinedDependencies['react-scripts'] &&
        (0, fileutils_1.directoryExists)('src') &&
        (0, fileutils_1.directoryExists)('public'));
}
