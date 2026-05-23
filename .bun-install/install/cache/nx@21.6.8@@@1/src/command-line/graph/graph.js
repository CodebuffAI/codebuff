"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGraph = generateGraph;
const crypto_1 = require("crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const http = require("node:http");
const minimatch_1 = require("minimatch");
const node_url_1 = require("node:url");
const open = require("open");
const node_path_1 = require("node:path");
const net = require("node:net");
const node_perf_hooks_1 = require("node:perf_hooks");
const configuration_1 = require("../../config/configuration");
const fileutils_1 = require("../../utils/fileutils");
const output_1 = require("../../utils/output");
const workspace_root_1 = require("../../utils/workspace-root");
const client_1 = require("../../daemon/client/client");
const typescript_1 = require("../../plugins/js/utils/typescript");
const operators_1 = require("../../project-graph/operators");
const project_graph_1 = require("../../project-graph/project-graph");
const create_task_graph_1 = require("../../tasks-runner/create-task-graph");
const all_file_data_1 = require("../../utils/all-file-data");
const command_line_utils_1 = require("../../utils/command-line-utils");
const native_1 = require("../../native");
const transform_objects_1 = require("../../native/transform-objects");
const affected_1 = require("../affected/affected");
const nx_deps_cache_1 = require("../../project-graph/nx-deps-cache");
const task_hasher_1 = require("../../hasher/task-hasher");
const create_task_hasher_1 = require("../../hasher/create-task-hasher");
const error_types_1 = require("../../project-graph/error-types");
const nx_cloud_utils_1 = require("../../utils/nx-cloud-utils");
// maps file extention to MIME types
const mimeType = {
    '.ico': 'image/x-icon',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.eot': 'appliaction/vnd.ms-fontobject',
    '.ttf': 'aplication/font-sfnt',
};
function buildEnvironmentJs(exclude, watchMode, localMode, depGraphClientResponse, taskGraphClientResponse, expandedTaskInputsReponse, sourceMapsResponse) {
    let environmentJs = `window.exclude = ${JSON.stringify(exclude)};
  window.watch = ${!!watchMode};
  window.environment = 'release';
  window.localMode = '${localMode}';

  window.appConfig = {
    showDebugger: false,
    showExperimentalFeatures: false,
    workspaces: [
      {
        id: 'local',
        label: 'local',
        projectGraphUrl: 'project-graph.json',
        taskGraphUrl: 'task-graph.json',
        taskInputsUrl: 'task-inputs.json',
        sourceMapsUrl: 'source-maps.json'
      }
    ],
    defaultWorkspaceId: 'local',
  };
  `;
    if (localMode === 'build') {
        environmentJs += `window.projectGraphResponse = ${JSON.stringify(depGraphClientResponse)};
    `;
        environmentJs += `window.taskGraphResponse = ${JSON.stringify(taskGraphClientResponse)};
    `;
        environmentJs += `window.expandedTaskInputsResponse = ${JSON.stringify(expandedTaskInputsReponse)};`;
        environmentJs += `window.sourceMapsResponse = ${JSON.stringify(sourceMapsResponse)};`;
    }
    else {
        environmentJs += `window.projectGraphResponse = null;`;
        environmentJs += `window.taskGraphResponse = null;`;
        environmentJs += `window.expandedTaskInputsResponse = null;`;
        environmentJs += `window.sourceMapsResponse = null;`;
    }
    return environmentJs;
}
function projectExists(projects, projectToFind) {
    return (projects.find((project) => project.name === projectToFind) !== undefined);
}
function hasPath(graph, target, node, visited) {
    if (target === node)
        return true;
    for (let d of graph.dependencies[node] || []) {
        if (visited.indexOf(d.target) > -1)
            continue;
        visited.push(d.target);
        if (hasPath(graph, target, d.target, visited))
            return true;
    }
    return false;
}
function filterGraph(graph, focus, exclude) {
    let projectNames = Object.values(graph.nodes).map((project) => project.name);
    let filteredProjectNames;
    if (focus !== null) {
        filteredProjectNames = new Set();
        projectNames.forEach((p) => {
            const isInPath = hasPath(graph, p, focus, []) || hasPath(graph, focus, p, []);
            if (isInPath) {
                filteredProjectNames.add(p);
            }
        });
    }
    else {
        filteredProjectNames = new Set(projectNames);
    }
    if (exclude.length !== 0) {
        exclude.forEach((p) => filteredProjectNames.delete(p));
    }
    let filteredGraph = {
        nodes: {},
        dependencies: {},
    };
    filteredProjectNames.forEach((p) => {
        filteredGraph.nodes[p] = graph.nodes[p];
        filteredGraph.dependencies[p] = graph.dependencies[p];
    });
    return filteredGraph;
}
async function generateGraph(args, affectedProjects) {
    if (args.view === 'project-details' && !args.focus) {
        output_1.output.error({
            title: `The project details view requires the --focus option.`,
        });
        process.exit(1);
    }
    if (args.view === 'project-details' && (args.targets || args.affected)) {
        output_1.output.error({
            title: `The project details view can only be used with the --focus option.`,
            bodyLines: [
                `You passed ${args.targets ? '--targets ' : ''}${args.affected ? '--affected ' : ''}`,
            ],
        });
        process.exit(1);
    }
    let rawGraph;
    let sourceMaps;
    let isPartial = false;
    try {
        const projectGraphAndSourceMaps = await (0, project_graph_1.createProjectGraphAndSourceMapsAsync)({ exitOnError: false });
        rawGraph = projectGraphAndSourceMaps.projectGraph;
        sourceMaps = projectGraphAndSourceMaps.sourceMaps;
    }
    catch (e) {
        if (e instanceof error_types_1.ProjectGraphError) {
            rawGraph = e.getPartialProjectGraph();
            sourceMaps = e.getPartialSourcemaps();
            isPartial = true;
        }
        if (!rawGraph) {
            (0, project_graph_1.handleProjectGraphError)({ exitOnError: true }, e);
        }
        else {
            const errors = e.getErrors();
            if (errors?.length > 0) {
                errors.forEach((e) => {
                    output_1.output.error({ title: e.message, bodyLines: [e.stack] });
                });
            }
            output_1.output.warn({
                title: `${errors?.length > 1 ? `${errors.length} errors` : `An error`} occured while processing the project graph. Showing partial graph.`,
            });
        }
    }
    let prunedGraph = (0, operators_1.pruneExternalNodes)(rawGraph);
    const projects = Object.values(prunedGraph.nodes);
    projects.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });
    if (args.focus) {
        if (!projectExists(projects, args.focus)) {
            output_1.output.error({
                title: `Project to focus does not exist.`,
                bodyLines: [`You provided --focus=${args.focus}`],
            });
            process.exit(1);
        }
    }
    try {
        affectedProjects = (await (0, affected_1.getAffectedGraphNodes)((0, command_line_utils_1.splitArgsIntoNxArgsAndOverrides)(args, 'affected', {
            printWarnings: args.affected && !args.print && args.file !== 'stdout',
        }, (0, configuration_1.readNxJson)()).nxArgs, rawGraph)).map((n) => n.name);
    }
    catch (e) {
        // if `--affected` is explicitly passed in or
        // resolved `args.affected` is true, then calculating affected projects
        // is intended (and expected) so we rethrow the error here.
        if (args.affected) {
            throw e;
        }
        // if `affected` is falsy, and we calculate affected projects for default case
        // and the operation might fail (i.e: in e2e tests), we fallback to empty array
        affectedProjects = [];
    }
    if (args.exclude) {
        const invalidExcludes = [];
        args.exclude.forEach((project) => {
            if (!projectExists(projects, project)) {
                invalidExcludes.push(project);
            }
        });
        if (invalidExcludes.length > 0) {
            output_1.output.error({
                title: `The following projects provided to --exclude do not exist:`,
                bodyLines: invalidExcludes,
            });
            process.exit(1);
        }
    }
    let html = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '../../core/graph/index.html'), 'utf-8');
    prunedGraph = filterGraph(prunedGraph, args.focus || null, args.exclude || []);
    if (args.print || args.file === 'stdout') {
        console.log(JSON.stringify(await createJsonOutput(prunedGraph, rawGraph, args.projects, args.targets), null, 2));
        await output_1.output.drain();
        process.exit(0);
    }
    if (args.file) {
        const workspaceFolder = workspace_root_1.workspaceRoot;
        const ext = (0, node_path_1.extname)(args.file);
        const fullFilePath = (0, node_path_1.isAbsolute)(args.file)
            ? args.file
            : (0, node_path_1.join)(workspaceFolder, args.file);
        const fileFolderPath = (0, node_path_1.dirname)(fullFilePath);
        if (ext === '.html') {
            const assetsFolder = (0, node_path_1.join)(fileFolderPath, 'static');
            const assets = [];
            (0, node_fs_1.cpSync)((0, node_path_1.join)(__dirname, '../../core/graph'), assetsFolder, {
                filter: (_src, dest) => {
                    const isntHtml = !/index\.html/.test(dest);
                    if (isntHtml && dest.includes('.')) {
                        assets.push(dest);
                    }
                    return isntHtml;
                },
                recursive: true,
            });
            const { projectGraphClientResponse } = await createProjectGraphAndSourceMapClientResponse(affectedProjects);
            const taskGraphClientResponse = args.targets
                ? await createTaskGraphForTargetsAndProjects(args.targets, args.projects)
                : await createTaskGraphClientResponse();
            const taskInputsReponse = await createExpandedTaskInputResponse(taskGraphClientResponse, projectGraphClientResponse);
            const environmentJs = buildEnvironmentJs(args.exclude || [], args.watch, !!args.file && args.file.endsWith('html') ? 'build' : 'serve', projectGraphClientResponse, taskGraphClientResponse, taskInputsReponse, sourceMaps);
            html = html.replace(/src="/g, 'src="static/');
            html = html.replace(/href="styles/g, 'href="static/styles');
            html = html.replace(/<base href="\/".*>/g, '');
            html = html.replace(/type="module"/g, '');
            (0, node_fs_1.writeFileSync)(fullFilePath, html);
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(assetsFolder, 'environment.js'), environmentJs);
            output_1.output.success({
                title: `HTML output created in ${fileFolderPath}`,
                bodyLines: [fileFolderPath, ...assets],
            });
        }
        else if (ext === '.json') {
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(fullFilePath), { recursive: true });
            const json = await createJsonOutput(prunedGraph, rawGraph, args.projects, args.targets);
            (0, fileutils_1.writeJsonFile)(fullFilePath, json);
            output_1.output.success({
                title: `JSON output created in ${fileFolderPath}`,
                bodyLines: [fullFilePath],
            });
        }
        else {
            output_1.output.error({
                title: `Please specify a filename with either .json or .html extension.`,
                bodyLines: [`You provided --file=${args.file}`],
            });
            process.exit(1);
        }
        process.exit(0);
    }
    else {
        const environmentJs = buildEnvironmentJs(args.exclude || [], args.watch, !!args.file && args.file.endsWith('html') ? 'build' : 'serve');
        let app;
        let url;
        try {
            const result = await startServer(html, environmentJs, args.host || '127.0.0.1', args.port || 4211, args.watch, affectedProjects, args.focus, args.groupByFolder, args.exclude);
            app = result.app;
            url = result.url;
        }
        catch (err) {
            output_1.output.error({
                title: 'Failed to start graph server',
                bodyLines: [err.message],
            });
            process.exit(1);
        }
        // setting up `?graph=serialized-graph-state`
        let graphState = undefined;
        url.pathname = args.view;
        if (args.focus) {
            if (args.view === 'project-details') {
                url.pathname += '/' + encodeURIComponent(args.focus);
            }
            else if (args.view === 'projects') {
                graphState ??= { config: {} };
                graphState.state = {
                    type: 'focused',
                    nodeId: encodeURIComponent(`project-${args.focus}`),
                };
            }
        }
        // Add targets as query parameters for tasks view
        if (args.view === 'tasks' && args.targets && args.targets.length > 0) {
            const targets = Array.isArray(args.targets)
                ? args.targets
                : [args.targets];
            url.searchParams.append('targets', targets.join(' '));
        }
        if (args.all) {
            if (args.view === 'tasks') {
                url.pathname += '/all';
            }
        }
        else if (args.projects) {
            url.searchParams.append('projects', args.projects.map((projectName) => projectName).join(' '));
        }
        else if (args.affected) {
            graphState ??= { config: {} };
            graphState.config = { ...graphState.config, showMode: 'affected' };
        }
        if (graphState && args.view === 'projects') {
            // only projects graph restore-able state  is relevant at the moment
            url.searchParams.set('rawGraph', JSON.stringify(graphState));
        }
        output_1.output.success({
            title: `Project graph started at ${url.toString()}`,
        });
        if (args.open) {
            open(url.toString());
        }
        return new Promise((res) => {
            app.once('close', res);
        });
    }
}
function findAvailablePort(startPort, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, host, () => {
            const port = server.address().port;
            server.close(() => {
                resolve(port);
            });
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                // Port is in use, try the next one
                findAvailablePort(startPort + 1, host)
                    .then(resolve)
                    .catch(reject);
            }
            else {
                reject(err);
            }
        });
    });
}
async function startServer(html, environmentJs, host, port = 4211, watchForChanges = true, affected = [], focus = null, groupByFolder = false, exclude = []) {
    let unregisterFileWatcher;
    if (watchForChanges && !client_1.daemonClient.enabled()) {
        output_1.output.warn({
            title: 'Nx Daemon is not enabled. Graph will not refresh on file changes.',
        });
    }
    if (watchForChanges && client_1.daemonClient.enabled()) {
        unregisterFileWatcher = await createFileWatcher();
    }
    const { projectGraphClientResponse, sourceMapResponse } = await createProjectGraphAndSourceMapClientResponse(affected);
    currentProjectGraphClientResponse = projectGraphClientResponse;
    currentProjectGraphClientResponse.focus = focus;
    currentProjectGraphClientResponse.groupByFolder = groupByFolder;
    currentProjectGraphClientResponse.exclude = exclude;
    currentSourceMapsClientResponse = sourceMapResponse;
    const app = http.createServer(async (req, res) => {
        // parse URL
        const parsedUrl = new node_url_1.URL(req.url, `http://${host}:${port}`);
        // extract URL path
        // Avoid https://en.wikipedia.org/wiki/Directory_traversal_attack
        // e.g curl --path-as-is http://localhost:9000/../fileInDanger.txt
        // by limiting the path to current directory only
        res.setHeader('Access-Control-Allow-Origin', '*');
        const sanitizePath = (0, node_path_1.basename)(parsedUrl.pathname);
        if (sanitizePath === 'project-graph.json') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(currentProjectGraphClientResponse));
            return;
        }
        if (sanitizePath === 'task-graph.json') {
            const projectsParam = parsedUrl.searchParams.get('projects');
            const targetsParam = parsedUrl.searchParams.get('targets');
            const configuration = parsedUrl.searchParams.get('configuration');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (targetsParam) {
                const targetNames = targetsParam.split(' ').filter(Boolean);
                const projectNames = projectsParam
                    ? projectsParam.split(' ').filter(Boolean)
                    : undefined;
                return res.end(JSON.stringify(await createTaskGraphForTargetsAndProjects(targetNames, projectNames, configuration)));
            }
            // load all task graphs if there's no targets specified
            return res.end(JSON.stringify(await createTaskGraphClientResponse()));
        }
        if (sanitizePath === 'task-inputs.json') {
            node_perf_hooks_1.performance.mark('task input generation:start');
            const taskId = parsedUrl.searchParams.get('taskId');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            const inputs = await getExpandedTaskInputs(taskId);
            node_perf_hooks_1.performance.mark('task input generation:end');
            res.end(JSON.stringify({ [taskId]: inputs }));
            node_perf_hooks_1.performance.measure('task input generation', 'task input generation:start', 'task input generation:end');
            return;
        }
        if (sanitizePath === 'source-maps.json') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(currentSourceMapsClientResponse));
            return;
        }
        if (sanitizePath === 'currentHash') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ hash: currentProjectGraphClientResponse.hash }));
            return;
        }
        if (sanitizePath === 'environment.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(environmentJs);
            return;
        }
        if (sanitizePath === 'help') {
            const project = parsedUrl.searchParams.get('project');
            const target = parsedUrl.searchParams.get('target');
            try {
                const text = getHelpTextFromTarget(project, target);
                res.writeHead(200, { 'Content-Type': 'application/javascript' });
                res.end(JSON.stringify({ text, success: true }));
            }
            catch (err) {
                res.writeHead(200, { 'Content-Type': 'application/javascript' });
                res.end(JSON.stringify({ text: err.message, success: false }));
            }
            return;
        }
        let pathname = (0, node_path_1.join)(__dirname, '../../core/graph/', sanitizePath);
        // if the file is not found or is a directory, return index.html
        if (!(0, node_fs_1.existsSync)(pathname) || (0, node_fs_1.statSync)(pathname).isDirectory()) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            return;
        }
        try {
            const data = (0, node_fs_1.readFileSync)(pathname);
            const ext = (0, node_path_1.parse)(pathname).ext;
            res.setHeader('Content-type', mimeType[ext] || 'text/plain');
            res.end(data);
        }
        catch (err) {
            res.statusCode = 500;
            res.end(`Error getting the file: ${err}.`);
        }
    });
    const handleTermination = async (exitCode) => {
        if (unregisterFileWatcher) {
            unregisterFileWatcher();
        }
        process.exit(exitCode);
    };
    process.on('SIGINT', () => handleTermination(128 + 2));
    process.on('SIGTERM', () => handleTermination(128 + 15));
    // Find an available port starting from the requested port
    const availablePort = await findAvailablePort(port, host);
    return new Promise((res, rej) => {
        app.on('error', (err) => {
            rej(err);
        });
        app.listen(availablePort, host, () => {
            if (availablePort !== port) {
                output_1.output.note({
                    title: `Port ${port} was already in use, using port ${availablePort} instead`,
                });
            }
            res({ app, url: new node_url_1.URL(`http://${host}:${availablePort}`) });
        });
    });
}
let currentProjectGraphClientResponse = {
    hash: null,
    projects: [],
    dependencies: {},
    fileMap: {},
    layout: {
        appsDir: '',
        libsDir: '',
    },
    affected: [],
    focus: null,
    groupByFolder: false,
    exclude: [],
    isPartial: false,
    errors: [],
};
let currentSourceMapsClientResponse = {};
function debounce(fn, time) {
    let timeout;
    return (...args) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => fn(...args), time);
    };
}
function createFileWatcher() {
    return client_1.daemonClient.registerFileWatcher({
        watchProjects: 'all',
        includeGlobalWorkspaceFiles: true,
        allowPartialGraph: true,
    }, debounce(async (error, changes) => {
        if (error === 'closed') {
            output_1.output.error({ title: `Watch error: Daemon closed the connection` });
            process.exit(1);
        }
        else if (error) {
            output_1.output.error({ title: `Watch error: ${error?.message ?? 'Unknown'}` });
        }
        else if (changes !== null && changes.changedFiles.length > 0) {
            output_1.output.note({ title: 'Recalculating project graph...' });
            const { projectGraphClientResponse, sourceMapResponse } = await createProjectGraphAndSourceMapClientResponse();
            if (projectGraphClientResponse.hash !==
                currentProjectGraphClientResponse.hash &&
                sourceMapResponse) {
                if (projectGraphClientResponse.errors?.length > 0) {
                    projectGraphClientResponse.errors.forEach((e) => {
                        output_1.output.error({
                            title: e.message,
                            bodyLines: [e.stack],
                        });
                    });
                    output_1.output.warn({
                        title: `${projectGraphClientResponse.errors.length > 1
                            ? `${projectGraphClientResponse.errors.length} errors`
                            : `An error`} occured while processing the project graph. Showing partial graph.`,
                    });
                }
                output_1.output.note({ title: 'Graph changes updated.' });
                currentProjectGraphClientResponse = projectGraphClientResponse;
                currentSourceMapsClientResponse = sourceMapResponse;
                // Clear task graph cache when project graph changes
                clearTaskGraphCache();
            }
            else {
                output_1.output.note({ title: 'No graph changes found.' });
            }
        }
    }, 500));
}
async function createProjectGraphAndSourceMapClientResponse(affected = []) {
    node_perf_hooks_1.performance.mark('project graph watch calculation:start');
    let projectGraph;
    let sourceMaps;
    let isPartial = false;
    let errors;
    let connectedToCloud;
    let disabledTaskSyncGenerators;
    try {
        const projectGraphAndSourceMaps = await (0, project_graph_1.createProjectGraphAndSourceMapsAsync)({ exitOnError: false });
        projectGraph = projectGraphAndSourceMaps.projectGraph;
        sourceMaps = projectGraphAndSourceMaps.sourceMaps;
        const nxJson = (0, configuration_1.readNxJson)();
        connectedToCloud = (0, nx_cloud_utils_1.isNxCloudUsed)(nxJson);
        disabledTaskSyncGenerators = nxJson.sync?.disabledTaskSyncGenerators;
    }
    catch (e) {
        if (e instanceof error_types_1.ProjectGraphError) {
            projectGraph = e.getPartialProjectGraph();
            sourceMaps = e.getPartialSourcemaps();
            errors = e.getErrors().map((e) => ({
                message: e.message,
                stack: e.stack,
                cause: e.cause,
                name: e.name,
                pluginName: e.pluginName,
                fileName: e.file ?? e.cause?.errors?.[0]?.location?.file,
            }));
            isPartial = true;
        }
        if (!projectGraph) {
            (0, project_graph_1.handleProjectGraphError)({ exitOnError: true }, e);
        }
    }
    let graph = (0, operators_1.pruneExternalNodes)(projectGraph);
    const fileMap = (0, nx_deps_cache_1.readFileMapCache)()?.fileMap.projectFileMap || {};
    node_perf_hooks_1.performance.mark('project graph watch calculation:end');
    node_perf_hooks_1.performance.mark('project graph response generation:start');
    const layout = (0, configuration_1.workspaceLayout)();
    const projects = Object.values(graph.nodes);
    const dependencies = graph.dependencies;
    const hasher = (0, crypto_1.createHash)('sha256');
    hasher.update(JSON.stringify({
        layout,
        projects,
        dependencies,
        sourceMaps,
        errors,
        connectedToCloud,
        disabledTaskSyncGenerators,
    }));
    const hash = hasher.digest('hex');
    node_perf_hooks_1.performance.mark('project graph response generation:end');
    node_perf_hooks_1.performance.measure('project graph watch calculation', 'project graph watch calculation:start', 'project graph watch calculation:end');
    node_perf_hooks_1.performance.measure('project graph response generation', 'project graph response generation:start', 'project graph response generation:end');
    return {
        projectGraphClientResponse: {
            ...currentProjectGraphClientResponse,
            hash,
            layout,
            projects,
            dependencies,
            affected,
            fileMap,
            isPartial,
            errors,
            connectedToCloud,
            disabledTaskSyncGenerators,
        },
        sourceMapResponse: sourceMaps,
    };
}
async function createTaskGraphClientResponse(pruneExternal = false) {
    let graph;
    try {
        graph = await (0, project_graph_1.createProjectGraphAsync)({ exitOnError: false });
    }
    catch (e) {
        if (e instanceof error_types_1.ProjectGraphError) {
            graph = e.getPartialProjectGraph();
        }
    }
    if (pruneExternal) {
        graph = (0, operators_1.pruneExternalNodes)(graph);
    }
    const nxJson = (0, configuration_1.readNxJson)();
    node_perf_hooks_1.performance.mark('task graph generation:start');
    const projects = Object.keys(graph.nodes);
    const allTargets = new Set();
    for (const projectName in graph.nodes) {
        const project = graph.nodes[projectName];
        Object.keys(project.data.targets ?? {}).forEach((target) => {
            allTargets.add(target);
        });
    }
    const targets = Array.from(allTargets);
    try {
        const taskGraph = (0, create_task_graph_1.createTaskGraph)(graph, {}, projects, targets, undefined, {});
        node_perf_hooks_1.performance.mark('task graph generation:end');
        const planner = new native_1.HashPlanner(nxJson, (0, native_1.transferProjectGraph)((0, transform_objects_1.transformProjectGraphForRust)(graph)));
        node_perf_hooks_1.performance.mark('task hash plan generation:start');
        const taskIds = Object.keys(taskGraph.tasks);
        const plans = taskIds.length > 0 ? planner.getPlans(taskIds, taskGraph) : {};
        node_perf_hooks_1.performance.mark('task hash plan generation:end');
        node_perf_hooks_1.performance.measure('task graph generation', 'task graph generation:start', 'task graph generation:end');
        node_perf_hooks_1.performance.measure('task hash plan generation', 'task hash plan generation:start', 'task hash plan generation:end');
        return { taskGraph, plans, error: null };
    }
    catch (err) {
        node_perf_hooks_1.performance.mark('task graph generation:end');
        node_perf_hooks_1.performance.measure('task graph generation (failed)', 'task graph generation:start', 'task graph generation:end');
        return {
            taskGraph: {
                tasks: {},
                dependencies: {},
                continuousDependencies: {},
                roots: [],
            },
            plans: {},
            error: err.message,
        };
    }
}
async function createExpandedTaskInputResponse(taskGraphClientResponse, depGraphClientResponse) {
    node_perf_hooks_1.performance.mark('task input static generation:start');
    const allWorkspaceFiles = await (0, all_file_data_1.allFileData)();
    const response = {};
    Object.entries(taskGraphClientResponse.plans).forEach(([key, inputs]) => {
        const [project] = key.split(':');
        const expandedInputs = expandInputs(inputs, depGraphClientResponse.projects.find((p) => p.name === project), allWorkspaceFiles, depGraphClientResponse);
        response[key] = expandedInputs;
    });
    node_perf_hooks_1.performance.mark('task input static generation:end');
    node_perf_hooks_1.performance.measure('task input static generation', 'task input static generation:start', 'task input static generation:end');
    return response;
}
// Performance optimized functions for lazy loading task graphs
// In-memory cache for task graphs to avoid regeneration
const taskGraphCache = new Map();
// In-memory cache for expanded task inputs to avoid regeneration
const expandedTaskInputsCache = new Map();
// Clear cache when project graph changes
function clearTaskGraphCache() {
    taskGraphCache.clear();
    expandedTaskInputsCache.clear();
}
/**
 * Creates a single task graph for multiple projects with multiple targets
 * If no projects specified, returns graph for all projects with the targets
 */
async function createTaskGraphForTargetsAndProjects(targetNames, projectNames, configuration) {
    // Get project graph
    let graph;
    try {
        graph = await (0, project_graph_1.createProjectGraphAsync)({ exitOnError: false });
    }
    catch (e) {
        if (e instanceof error_types_1.ProjectGraphError) {
            graph = e.getPartialProjectGraph();
        }
    }
    const nxJson = (0, configuration_1.readNxJson)();
    node_perf_hooks_1.performance.mark(`task graph generation:start`);
    let projectsToUse;
    if (projectNames && projectNames.length > 0) {
        projectsToUse = projectNames;
    }
    else {
        // Get all projects that have at least one of the targets
        projectsToUse = Object.entries(graph.nodes)
            .filter(([_, project]) => targetNames.some((targetName) => project.data.targets?.[targetName]))
            .map(([projectName]) => projectName);
    }
    try {
        // Create single task graph
        const taskGraph = (0, create_task_graph_1.createTaskGraph)(graph, {}, projectsToUse, targetNames, configuration, {});
        node_perf_hooks_1.performance.mark(`task graph generation:end`);
        const planner = new native_1.HashPlanner(nxJson, (0, native_1.transferProjectGraph)((0, transform_objects_1.transformProjectGraphForRust)(graph)));
        node_perf_hooks_1.performance.mark('task hash plan generation:start');
        const taskIds = Object.keys(taskGraph.tasks);
        const plans = taskIds.length > 0 ? planner.getPlans(taskIds, taskGraph) : {};
        node_perf_hooks_1.performance.mark('task hash plan generation:end');
        node_perf_hooks_1.performance.measure(`task graph generation for ${targetNames.join(', ')}`, `task graph generation:start`, `task graph generation:end`);
        node_perf_hooks_1.performance.measure('task hash plan generation', 'task hash plan generation:start', 'task hash plan generation:end');
        return { taskGraph, plans, error: null };
    }
    catch (err) {
        node_perf_hooks_1.performance.mark(`task graph generation:end`);
        node_perf_hooks_1.performance.measure(`task graph generation for ${targetNames.join(', ')} (failed)`, `task graph generation:start`, `task graph generation:end`);
        return {
            taskGraph: {
                tasks: {},
                dependencies: {},
                continuousDependencies: {},
                roots: [],
            },
            plans: {},
            error: err.message,
        };
    }
}
async function getExpandedTaskInputs(taskId) {
    // Check cache first
    if (expandedTaskInputsCache.has(taskId)) {
        return expandedTaskInputsCache.get(taskId);
    }
    // Use the optimized version that only creates the specific task graph needed
    const [projectName, targetName, configuration] = taskId.split(':');
    const taskGraphResponse = await createTaskGraphForTargetsAndProjects([targetName], [projectName], configuration);
    const allWorkspaceFiles = await (0, all_file_data_1.allFileData)();
    const inputs = taskGraphResponse.plans?.[taskId];
    let result = {};
    if (inputs) {
        result = expandInputs(inputs, currentProjectGraphClientResponse.projects.find((p) => p.name === projectName), allWorkspaceFiles, currentProjectGraphClientResponse);
    }
    // Cache the result
    expandedTaskInputsCache.set(taskId, result);
    return result;
}
function expandInputs(inputs, project, allWorkspaceFiles, depGraphClientResponse) {
    const projectNames = depGraphClientResponse.projects.map((p) => p.name);
    const workspaceRootInputs = [];
    const projectRootInputs = [];
    const externalInputs = [];
    const otherInputs = [];
    inputs.forEach((input) => {
        // grouped workspace inputs look like workspace:[pattern,otherPattern]
        if (input.startsWith('workspace:[')) {
            const inputs = input.substring(11, input.length - 1).split(',');
            workspaceRootInputs.push(...inputs);
            return;
        }
        const maybeProjectName = input.split(':')[0];
        if (projectNames.includes(maybeProjectName)) {
            projectRootInputs.push(input);
            return;
        }
        if (input === 'ProjectConfiguration' ||
            input === 'TsConfig' ||
            input === 'AllExternalDependencies') {
            otherInputs.push(input);
            return;
        }
        // there shouldn't be any other imports in here, but external ones are always going to have a modifier in front
        if (input.includes(':')) {
            externalInputs.push(input);
            return;
        }
    });
    const workspaceRootsExpanded = getExpandedWorkspaceRoots(workspaceRootInputs, allWorkspaceFiles);
    const otherInputsExpanded = otherInputs.map((input) => {
        if (input === 'TsConfig') {
            return (0, node_path_1.relative)(workspace_root_1.workspaceRoot, (0, typescript_1.getRootTsConfigPath)());
        }
        if (input === 'ProjectConfiguration') {
            return depGraphClientResponse.fileMap[project.name].find((file) => file.file === `${project.data.root}/project.json` ||
                file.file === `${project.data.root}/package.json`).file;
        }
        return input;
    });
    const projectRootsExpanded = projectRootInputs
        .map((input) => {
        const fileSetProjectName = input.split(':')[0];
        const fileSetProject = depGraphClientResponse.projects.find((p) => p.name === fileSetProjectName);
        const fileSets = input.replace(`${fileSetProjectName}:`, '').split(',');
        const projectInputExpanded = {
            [fileSetProject.name]: (0, task_hasher_1.filterUsingGlobPatterns)(fileSetProject.data.root, depGraphClientResponse.fileMap[fileSetProject.name] || [], fileSets).map((f) => f.file),
        };
        return projectInputExpanded;
    })
        .reduce((curr, acc) => {
        for (let key in curr) {
            acc[key] = curr[key];
        }
        return acc;
    }, {});
    return {
        general: [...workspaceRootsExpanded, ...otherInputsExpanded],
        ...projectRootsExpanded,
        external: externalInputs,
    };
}
function getExpandedWorkspaceRoots(workspaceRootInputs, allWorkspaceFiles) {
    const workspaceRootsExpanded = [];
    const negativeWRPatterns = [];
    const positiveWRPatterns = [];
    for (const fileset of workspaceRootInputs) {
        if (fileset.startsWith('!')) {
            negativeWRPatterns.push(fileset.substring(17));
        }
        else {
            positiveWRPatterns.push(fileset.substring(16));
        }
    }
    for (const pattern of positiveWRPatterns) {
        const matchingFile = allWorkspaceFiles.find((t) => t.file === pattern);
        if (matchingFile &&
            !negativeWRPatterns.some((p) => (0, minimatch_1.minimatch)(matchingFile.file, p))) {
            workspaceRootsExpanded.push(matchingFile.file);
        }
        else {
            allWorkspaceFiles
                .filter((f) => (0, minimatch_1.minimatch)(f.file, pattern) &&
                !negativeWRPatterns.some((p) => (0, minimatch_1.minimatch)(f.file, p)))
                .forEach((f) => {
                workspaceRootsExpanded.push(f.file);
            });
        }
    }
    workspaceRootsExpanded.sort();
    return workspaceRootsExpanded;
}
async function createJsonOutput(prunedGraph, rawGraph, projects, targets) {
    const response = {
        graph: prunedGraph,
    };
    if (targets?.length) {
        const taskGraph = (0, create_task_graph_1.createTaskGraph)(rawGraph, {}, projects, targets, undefined, {});
        const hasher = (0, create_task_hasher_1.createTaskHasher)(rawGraph, (0, configuration_1.readNxJson)());
        let tasks = Object.values(taskGraph.tasks);
        const hashes = await hasher.hashTasks(tasks, taskGraph);
        response.tasks = taskGraph;
        response.taskPlans = tasks.reduce((acc, task, index) => {
            acc[task.id] = Object.keys(hashes[index].details.nodes).sort();
            return acc;
        }, {});
    }
    return response;
}
function getHelpTextFromTarget(projectName, targetName) {
    if (!projectName)
        throw new Error(`Missing project`);
    if (!targetName)
        throw new Error(`Missing target`);
    const project = currentProjectGraphClientResponse.projects?.find((p) => p.name === projectName);
    if (!project)
        throw new Error(`Cannot find project ${projectName}`);
    const target = project.data.targets[targetName];
    if (!target)
        throw new Error(`Cannot find target ${targetName}`);
    const command = target.metadata?.help?.command;
    if (!command)
        throw new Error(`No help command found for ${projectName}:${targetName}`);
    return (0, node_child_process_1.execSync)(command, {
        cwd: target.options?.cwd ?? workspace_root_1.workspaceRoot,
        windowsHide: false,
    }).toString();
}
