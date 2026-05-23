"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExampleNonSemverVersionActions = exports.ExampleRustVersionActions = void 0;
exports.createNxReleaseConfigAndPopulateWorkspace = createNxReleaseConfigAndPopulateWorkspace;
exports.parseGraphDefinition = parseGraphDefinition;
exports.mockResolveVersionActionsForProjectImplementation = mockResolveVersionActionsForProjectImplementation;
const j_toml_1 = require("@ltd/j-toml");
const node_path_1 = require("node:path");
const json_1 = require("../../../generators/utils/json");
const file_map_utils_1 = require("../../../project-graph/file-map-utils");
const config_1 = require("../config/config");
const filter_release_groups_1 = require("../config/filter-release-groups");
const version_actions_1 = require("./version-actions");
async function createNxReleaseConfigAndPopulateWorkspace(tree, graphDefinition, additionalNxReleaseConfig, mockResolveCurrentVersion, filters = {}) {
    const graph = parseGraphDefinition(graphDefinition);
    const { groups, projectGraph } = setupGraph(tree, graph);
    const { error: configError, nxReleaseConfig } = await (0, config_1.createNxReleaseConfig)(projectGraph, await (0, file_map_utils_1.createProjectFileMapUsingProjectGraph)(projectGraph), {
        ...additionalNxReleaseConfig,
        groups,
        version: {
            ...additionalNxReleaseConfig.version,
            useLegacyVersioning: false,
        },
    });
    if (configError) {
        throw configError;
    }
    let { error: filterError, releaseGroups, releaseGroupToFilteredProjects, } = (0, filter_release_groups_1.filterReleaseGroups)(projectGraph, nxReleaseConfig, filters.projects, filters.groups);
    if (filterError) {
        throw filterError;
    }
    // Mock the implementation of resolveCurrentVersion to reliably return the version of the project based on our graph definition
    mockResolveCurrentVersion?.mockImplementation((_, { name }) => {
        for (const [projectName, project] of Object.entries(graph.projects)) {
            if (projectName === name) {
                return project.version ?? null;
            }
        }
        throw new Error(`Unknown project name in test utils: ${name}`);
    });
    return {
        projectGraph,
        nxReleaseConfig: nxReleaseConfig,
        releaseGroups,
        releaseGroupToFilteredProjects,
        filters,
    };
}
class ExampleRustVersionActions extends version_actions_1.VersionActions {
    constructor() {
        super(...arguments);
        this.validManifestFilenames = ['Cargo.toml'];
    }
    parseCargoToml(cargoString) {
        return j_toml_1.default.parse(cargoString, {
            x: { comment: true },
        });
    }
    static stringifyCargoToml(cargoToml) {
        const tomlString = j_toml_1.default.stringify(cargoToml, {
            newlineAround: 'section',
        });
        return Array.isArray(tomlString) ? tomlString.join('\n') : tomlString;
    }
    static modifyCargoTable(toml, section, key, value) {
        toml[section] ??= j_toml_1.default.Section({});
        toml[section][key] =
            typeof value === 'object' && !Array.isArray(value)
                ? j_toml_1.default.inline(value)
                : typeof value === 'function'
                    ? value()
                    : value;
    }
    async readCurrentVersionFromSourceManifest(tree) {
        const cargoTomlPath = (0, node_path_1.join)(this.projectGraphNode.data.root, 'Cargo.toml');
        const cargoTomlString = tree.read(cargoTomlPath, 'utf-8').toString();
        const cargoToml = this.parseCargoToml(cargoTomlString);
        const currentVersion = cargoToml.package?.version || '0.0.0';
        return {
            currentVersion,
            manifestPath: cargoTomlPath,
        };
    }
    async readCurrentVersionFromRegistry(tree, _currentVersionResolverMetadata) {
        // Real registry resolver not needed for this test example
        return {
            currentVersion: (await this.readCurrentVersionFromSourceManifest(tree))
                .currentVersion,
            logText: 'https://example.com/fake-registry',
        };
    }
    async updateProjectVersion(tree, newVersion) {
        const logMessages = [];
        for (const manifestToUpdate of this.manifestsToUpdate) {
            const cargoTomlString = tree
                .read(manifestToUpdate.manifestPath, 'utf-8')
                .toString();
            const cargoToml = this.parseCargoToml(cargoTomlString);
            ExampleRustVersionActions.modifyCargoTable(cargoToml, 'package', 'version', newVersion);
            const updatedCargoTomlString = ExampleRustVersionActions.stringifyCargoToml(cargoToml);
            tree.write(manifestToUpdate.manifestPath, updatedCargoTomlString);
            logMessages.push(`✍️  New version ${newVersion} written to manifest: ${manifestToUpdate.manifestPath}`);
        }
        return logMessages;
    }
    async readCurrentVersionOfDependency(tree, _projectGraph, dependencyProjectName) {
        const cargoTomlPath = (0, node_path_1.join)(this.projectGraphNode.data.root, 'Cargo.toml');
        const cargoTomlString = tree.read(cargoTomlPath, 'utf-8').toString();
        const cargoToml = this.parseCargoToml(cargoTomlString);
        const dependencyVersion = cargoToml.dependencies?.[dependencyProjectName];
        if (typeof dependencyVersion === 'string') {
            return {
                currentVersion: dependencyVersion,
                dependencyCollection: 'dependencies',
            };
        }
        return {
            currentVersion: dependencyVersion?.version || '0.0.0',
            dependencyCollection: 'dependencies',
        };
    }
    // NOTE: Does not take the preserveLocalDependencyProtocols setting into account yet
    async updateProjectDependencies(tree, _projectGraph, dependenciesToUpdate) {
        const numDependenciesToUpdate = Object.keys(dependenciesToUpdate).length;
        const depText = numDependenciesToUpdate === 1 ? 'dependency' : 'dependencies';
        if (numDependenciesToUpdate === 0) {
            return [];
        }
        const logMessages = [];
        for (const manifestToUpdate of this.manifestsToUpdate) {
            const cargoTomlString = tree
                .read(manifestToUpdate.manifestPath, 'utf-8')
                .toString();
            const cargoToml = this.parseCargoToml(cargoTomlString);
            for (const [dep, version] of Object.entries(dependenciesToUpdate)) {
                ExampleRustVersionActions.modifyCargoTable(cargoToml, 'dependencies', dep, version);
            }
            const updatedCargoTomlString = ExampleRustVersionActions.stringifyCargoToml(cargoToml);
            tree.write(manifestToUpdate.manifestPath, updatedCargoTomlString);
            logMessages.push(`✍️  Updated ${numDependenciesToUpdate} ${depText} in manifest: ${manifestToUpdate.manifestPath}`);
        }
        return logMessages;
    }
}
exports.ExampleRustVersionActions = ExampleRustVersionActions;
class ExampleNonSemverVersionActions extends version_actions_1.VersionActions {
    constructor() {
        super(...arguments);
        this.validManifestFilenames = null;
    }
    async readCurrentVersionFromSourceManifest() {
        return null;
    }
    async readCurrentVersionFromRegistry() {
        return null;
    }
    async readCurrentVersionOfDependency() {
        return {
            currentVersion: null,
            dependencyCollection: null,
        };
    }
    async updateProjectVersion(tree, newVersion) {
        tree.write((0, node_path_1.join)(this.projectGraphNode.data.root, 'version.txt'), newVersion);
        return [];
    }
    async updateProjectDependencies() {
        return [];
    }
    // Overwrite the default calculateNewVersion method to return the new version directly and not consider semver
    async calculateNewVersion(currentVersion, newVersionInput, newVersionInputReason, newVersionInputReasonData, preid) {
        if (newVersionInput === 'patch') {
            return {
                newVersion: '{SOME_NEW_VERSION_DERIVED_AS_A_SIDE_EFFECT_OF_DEPENDENCY_BUMP}',
                logText: `Determined new version as a side effect of dependency bump: ${newVersionInput}`,
            };
        }
        return {
            newVersion: newVersionInput,
            logText: `Applied new version directly: ${newVersionInput}`,
        };
    }
}
exports.ExampleNonSemverVersionActions = ExampleNonSemverVersionActions;
function parseGraphDefinition(definition) {
    const graph = { projects: {} };
    const lines = definition.trim().split('\n');
    let currentGroup = '';
    let groupConfig = {};
    let groupRelationship = '';
    let lastProjectName = '';
    lines.forEach((line) => {
        line = line.trim();
        if (!line) {
            // Skip empty lines
            return;
        }
        // Match group definitions with JSON config
        const groupMatch = line.match(/^(\w+)\s*\(\s*(\{.*?\})\s*\):$/);
        if (groupMatch) {
            currentGroup = groupMatch[1];
            groupConfig = JSON.parse(groupMatch[2]);
            groupRelationship = groupConfig['projectsRelationship'] || 'independent';
            return;
        }
        // Match project definitions with optional per-project JSON config
        const projectMatch = line.match(/^- ([\w-]+)(?:\[([\w\/-]+)\])?(?:@([\w\.-]+))? \[([\w-]+)(?::([^[\]]+))?\](?:\s*\(\s*(\{.*?\})\s*\))?$/);
        if (projectMatch) {
            const [_, name, customProjectRoot, version, language, alternateNameInManifest, configJson,] = projectMatch;
            // Automatically add data for Rust projects
            let projectData = {};
            if (customProjectRoot) {
                projectData.root = customProjectRoot;
            }
            if (language === 'rust') {
                projectData = {
                    release: { versionActions: exampleRustVersionActions },
                };
            }
            else if (language === 'non-semver') {
                projectData = {
                    release: { versionActions: exampleNonSemverVersionActions },
                };
            }
            // Merge explicit per-project config if present
            if (configJson) {
                const explicitConfig = JSON.parse(configJson);
                projectData = { ...projectData, ...explicitConfig };
            }
            graph.projects[name] = {
                version: version ?? null,
                language,
                group: currentGroup,
                relationship: groupRelationship,
                dependsOn: [],
                data: projectData,
                // E.g. package name in package.json doesn't necessarily match the name of the nx project
                alternateNameInManifest,
            };
            lastProjectName = name;
            return;
        }
        // Match release config overrides
        const releaseConfigMatch = line.match(/^-> release config overrides (\{.*\})$/);
        if (releaseConfigMatch) {
            const [_, releaseConfigJson] = releaseConfigMatch;
            const releaseConfigOverrides = JSON.parse(releaseConfigJson);
            if (!graph.projects[lastProjectName].releaseConfigOverrides) {
                graph.projects[lastProjectName].releaseConfigOverrides = {};
            }
            graph.projects[lastProjectName].releaseConfigOverrides = {
                ...graph.projects[lastProjectName].releaseConfigOverrides,
                ...releaseConfigOverrides,
            };
            return;
        }
        // Match dependencies
        const dependsMatch = line.match(/^-> depends on ([~^=]?)([\w-]+)(?:\((.*?)\))?(?:\s*\{(\w+)\})?$/);
        if (dependsMatch) {
            const [_, prefix, depProject, versionSpecifier, depCollection = 'dependencies',] = dependsMatch;
            // Add the dependency to the last added project
            if (!graph.projects[lastProjectName].dependsOn) {
                graph.projects[lastProjectName].dependsOn = [];
            }
            graph.projects[lastProjectName].dependsOn.push({
                project: depProject,
                collection: depCollection,
                prefix: prefix || '', // Store the prefix (empty string if not specified)
                versionSpecifier: versionSpecifier || undefined, // Store exact version specifier if provided
            });
            return;
        }
        // Ignore unrecognized lines
    });
    return graph;
}
function setupGraph(tree, graph) {
    const groups = {};
    const projectGraph = { nodes: {}, dependencies: {} };
    for (const [projectName, projectData] of Object.entries(graph.projects)) {
        const { version, language, group, relationship, dependsOn, data, alternateNameInManifest, releaseConfigOverrides, } = projectData;
        const packageName = alternateNameInManifest ?? projectName;
        // Write project files based on language
        if (language === 'js') {
            const packageJson = {
                name: packageName,
                version,
            };
            if (dependsOn) {
                dependsOn.forEach((dep) => {
                    if (!packageJson[dep.collection]) {
                        packageJson[dep.collection] = {};
                    }
                    const depNode = graph.projects[dep.project];
                    const depVersion = dep.versionSpecifier ?? depNode.version;
                    packageJson[dep.collection][depNode.alternateNameInManifest ?? dep.project] = `${dep.prefix}${depVersion}`;
                });
            }
            (0, json_1.writeJson)(tree, (0, node_path_1.join)(data.root ?? projectName, 'package.json'), packageJson);
            // Write extra manifest files if specified
            if (releaseConfigOverrides?.version?.manifestRootsToUpdate) {
                releaseConfigOverrides.version.manifestRootsToUpdate.forEach((root) => {
                    (0, json_1.writeJson)(tree, (0, node_path_1.join)(root, 'package.json'), packageJson);
                });
            }
        }
        else if (language === 'rust') {
            const cargoToml = {};
            ExampleRustVersionActions.modifyCargoTable(cargoToml, 'package', 'name', projectName);
            ExampleRustVersionActions.modifyCargoTable(cargoToml, 'package', 'version', version);
            if (dependsOn) {
                dependsOn.forEach((dep) => {
                    ExampleRustVersionActions.modifyCargoTable(cargoToml, dep.collection, dep.project, {
                        version: dep.versionSpecifier ?? graph.projects[dep.project].version,
                    });
                });
            }
            const contents = ExampleRustVersionActions.stringifyCargoToml(cargoToml);
            tree.write((0, node_path_1.join)(data.root ?? projectName, 'Cargo.toml'), contents);
            // Write extra manifest files if specified
            if (releaseConfigOverrides?.version?.manifestRootsToUpdate) {
                releaseConfigOverrides.version.manifestRootsToUpdate.forEach((root) => {
                    tree.write((0, node_path_1.join)(root, 'Cargo.toml'), contents);
                });
            }
        }
        else if (language === 'non-semver') {
            tree.write((0, node_path_1.join)(data.root ?? projectName, 'version.txt'), version ?? '');
        }
        // Add to projectGraph nodes
        const projectGraphProjectNode = {
            name: projectName,
            type: 'lib',
            data: {
                root: projectName,
                ...data, // Merge any additional data from project config
            },
        };
        if (language === 'js') {
            // Always add the js package metadata to match the @nx/js plugin
            projectGraphProjectNode.data.metadata = {
                js: {
                    packageName,
                },
            };
        }
        // Add project level release config overrides
        if (releaseConfigOverrides) {
            projectGraphProjectNode.data.release = {
                ...projectGraphProjectNode.data.release,
                ...releaseConfigOverrides,
            };
        }
        projectGraph.nodes[projectName] = projectGraphProjectNode;
        // Initialize dependencies
        projectGraph.dependencies[projectName] = [];
        // Handle dependencies
        if (dependsOn) {
            dependsOn.forEach((dep) => {
                projectGraph.dependencies[projectName].push({
                    source: projectName,
                    target: dep.project,
                    type: 'static',
                });
            });
        }
        // Add to releaseGroups
        if (!groups[group]) {
            groups[group] = {
                projectsRelationship: relationship,
                projects: [],
            };
        }
        groups[group].projects.push(projectName);
    }
    return { groups, projectGraph };
}
const exampleRustVersionActions = '__EXAMPLE_RUST_VERSION_ACTIONS__';
const exampleNonSemverVersionActions = '__EXAMPLE_NON_SEMVER_VERSION_ACTIONS__';
async function mockResolveVersionActionsForProjectImplementation(tree, releaseGroup, projectGraphNode, finalConfigForProject, isInProjectsToProcess) {
    if (projectGraphNode.data.release?.versionActions ===
        exampleRustVersionActions ||
        releaseGroup.versionActions === exampleRustVersionActions) {
        const versionActions = new ExampleRustVersionActions(releaseGroup, projectGraphNode, finalConfigForProject);
        // Initialize the versionActions with all the required manifest paths etc
        await versionActions.init(tree, isInProjectsToProcess);
        return {
            versionActionsPath: exampleRustVersionActions,
            versionActions,
        };
    }
    if (projectGraphNode.data.release?.versionActions ===
        exampleNonSemverVersionActions ||
        releaseGroup.versionActions === exampleNonSemverVersionActions) {
        const versionActions = new ExampleNonSemverVersionActions(releaseGroup, projectGraphNode, finalConfigForProject);
        // Initialize the versionActions with all the required manifest paths etc
        await versionActions.init(tree, isInProjectsToProcess);
        return {
            versionActionsPath: exampleNonSemverVersionActions,
            versionActions,
        };
    }
    const versionActionsPath = config_1.DEFAULT_VERSION_ACTIONS_PATH;
    // @ts-ignore
    const loaded = jest.requireActual(versionActionsPath);
    const JsVersionActions = loaded.default;
    const versionActions = new JsVersionActions(releaseGroup, projectGraphNode, finalConfigForProject);
    // Initialize the versionActions with all the required manifest paths etc
    await versionActions.init(tree, isInProjectsToProcess);
    return {
        versionActionsPath,
        versionActions: versionActions,
        afterAllProjectsVersioned: loaded.afterAllProjectsVersioned,
    };
}
