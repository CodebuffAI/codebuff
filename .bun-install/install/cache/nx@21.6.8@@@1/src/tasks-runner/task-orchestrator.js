"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskOrchestrator = void 0;
exports.getThreadCount = getThreadCount;
const events_1 = require("events");
const fs_1 = require("fs");
const path_1 = require("path");
const perf_hooks_1 = require("perf_hooks");
const run_commands_impl_1 = require("../executors/run-commands/run-commands.impl");
const hash_task_1 = require("../hasher/hash-task");
const native_1 = require("../native");
const db_connection_1 = require("../utils/db-connection");
const output_1 = require("../utils/output");
const params_1 = require("../utils/params");
const workspace_root_1 = require("../utils/workspace-root");
const cache_1 = require("./cache");
const forked_process_task_runner_1 = require("./forked-process-task-runner");
const is_tui_enabled_1 = require("./is-tui-enabled");
const pseudo_terminal_1 = require("./pseudo-terminal");
const noop_child_process_1 = require("./running-tasks/noop-child-process");
const task_env_1 = require("./task-env");
const tasks_schedule_1 = require("./tasks-schedule");
const utils_1 = require("./utils");
const shared_running_task_1 = require("./running-tasks/shared-running-task");
class TaskOrchestrator {
    // endregion internal state
    constructor(hasher, initiatingProject, initiatingTasks, projectGraph, taskGraph, nxJson, options, bail, daemon, outputStyle, taskGraphForHashing = taskGraph) {
        this.hasher = hasher;
        this.initiatingProject = initiatingProject;
        this.initiatingTasks = initiatingTasks;
        this.projectGraph = projectGraph;
        this.taskGraph = taskGraph;
        this.nxJson = nxJson;
        this.options = options;
        this.bail = bail;
        this.daemon = daemon;
        this.outputStyle = outputStyle;
        this.taskGraphForHashing = taskGraphForHashing;
        this.taskDetails = (0, hash_task_1.getTaskDetails)();
        this.cache = (0, cache_1.getCache)(this.options);
        this.tuiEnabled = (0, is_tui_enabled_1.isTuiEnabled)();
        this.forkedProcessTaskRunner = new forked_process_task_runner_1.ForkedProcessTaskRunner(this.options, this.tuiEnabled);
        this.runningTasksService = !native_1.IS_WASM
            ? new native_1.RunningTasksService((0, db_connection_1.getDbConnection)())
            : null;
        this.tasksSchedule = new tasks_schedule_1.TasksSchedule(this.projectGraph, this.taskGraph, this.options);
        // region internal state
        this.batchEnv = (0, task_env_1.getEnvVariablesForBatchProcess)(this.options.skipNxCache, this.options.captureStderr);
        this.reverseTaskDeps = (0, utils_1.calculateReverseDeps)(this.taskGraph);
        this.initializingTaskIds = new Set(this.initiatingTasks.map((t) => t.id));
        this.processedTasks = new Map();
        this.processedBatches = new Map();
        this.completedTasks = {};
        this.waitingForTasks = [];
        this.groups = [];
        this.bailed = false;
        this.runningContinuousTasks = new Map();
        this.runningRunCommandsTasks = new Map();
    }
    async init() {
        // Init the ForkedProcessTaskRunner, TasksSchedule, and Cache
        await Promise.all([
            this.forkedProcessTaskRunner.init(),
            this.tasksSchedule.init().then(() => {
                return this.tasksSchedule.scheduleNextTasks();
            }),
            'init' in this.cache ? this.cache.init() : null,
        ]);
        // Pass estimated timings to TUI after TasksSchedule is initialized
        if (this.tuiEnabled) {
            const estimatedTimings = this.tasksSchedule.getEstimatedTaskTimings();
            this.options.lifeCycle.setEstimatedTaskTimings(estimatedTimings);
        }
    }
    async run() {
        await this.init();
        perf_hooks_1.performance.mark('task-execution:start');
        const threadCount = getThreadCount(this.options, this.taskGraph);
        const threads = [];
        process.stdout.setMaxListeners(threadCount + events_1.defaultMaxListeners);
        process.stderr.setMaxListeners(threadCount + events_1.defaultMaxListeners);
        // initial seeding of the queue
        for (let i = 0; i < threadCount; ++i) {
            threads.push(this.executeNextBatchOfTasksUsingTaskSchedule());
        }
        await Promise.race([
            Promise.all(threads),
            ...(this.tuiEnabled
                ? [
                    new Promise((resolve) => {
                        this.options.lifeCycle.registerForcedShutdownCallback(() => {
                            // The user force quit the TUI with ctrl+c, so proceed onto cleanup
                            resolve(undefined);
                        });
                    }),
                ]
                : []),
        ]);
        perf_hooks_1.performance.mark('task-execution:end');
        perf_hooks_1.performance.measure('task-execution', 'task-execution:start', 'task-execution:end');
        this.cache.removeOldCacheRecords();
        await this.cleanup();
        return this.completedTasks;
    }
    nextBatch() {
        return this.tasksSchedule.nextBatch();
    }
    async executeNextBatchOfTasksUsingTaskSchedule() {
        // completed all the tasks
        if (!this.tasksSchedule.hasTasks() || this.bailed) {
            return null;
        }
        const doNotSkipCache = this.options.skipNxCache === false ||
            this.options.skipNxCache === undefined;
        this.processAllScheduledTasks();
        const batch = this.nextBatch();
        if (batch) {
            const groupId = this.closeGroup();
            await this.applyFromCacheOrRunBatch(doNotSkipCache, batch, groupId);
            this.openGroup(groupId);
            return this.executeNextBatchOfTasksUsingTaskSchedule();
        }
        const task = this.tasksSchedule.nextTask();
        if (task) {
            const groupId = this.closeGroup();
            if (task.continuous) {
                await this.startContinuousTask(task, groupId);
            }
            else {
                await this.applyFromCacheOrRunTask(doNotSkipCache, task, groupId);
            }
            this.openGroup(groupId);
            return this.executeNextBatchOfTasksUsingTaskSchedule();
        }
        // block until some other task completes, then try again
        return new Promise((res) => this.waitingForTasks.push(res)).then(() => this.executeNextBatchOfTasksUsingTaskSchedule());
    }
    processTasks(taskIds) {
        for (const taskId of taskIds) {
            // Task is already handled or being handled
            if (!this.processedTasks.has(taskId)) {
                this.processedTasks.set(taskId, this.processTask(taskId));
            }
        }
    }
    // region Processing Scheduled Tasks
    async processTask(taskId) {
        const task = this.taskGraph.tasks[taskId];
        const taskSpecificEnv = (0, task_env_1.getTaskSpecificEnv)(task);
        if (!task.hash) {
            await (0, hash_task_1.hashTask)(this.hasher, this.projectGraph, this.taskGraphForHashing, task, taskSpecificEnv, this.taskDetails);
        }
        await this.options.lifeCycle.scheduleTask(task);
        return taskSpecificEnv;
    }
    async processScheduledBatch(batch) {
        await Promise.all(Object.values(batch.taskGraph.tasks).map(async (task) => {
            if (!task.hash) {
                await (0, hash_task_1.hashTask)(this.hasher, this.projectGraph, this.taskGraphForHashing, task, this.batchEnv, this.taskDetails);
            }
            await this.options.lifeCycle.scheduleTask(task);
        }));
    }
    processAllScheduledTasks() {
        const { scheduledTasks, scheduledBatches } = this.tasksSchedule.getAllScheduledTasks();
        for (const batch of scheduledBatches) {
            this.processedBatches.set(batch, this.processScheduledBatch(batch));
        }
        this.processTasks(scheduledTasks);
    }
    // endregion Processing Scheduled Tasks
    // region Applying Cache
    async applyCachedResults(tasks) {
        const cacheableTasks = tasks.filter((t) => (0, utils_1.isCacheableTask)(t, this.options));
        const res = await Promise.all(cacheableTasks.map((t) => this.applyCachedResult(t)));
        return res.filter((r) => r !== null);
    }
    async applyCachedResult(task) {
        const cachedResult = await this.cache.get(task);
        if (!cachedResult || cachedResult.code !== 0)
            return null;
        const outputs = task.outputs;
        const shouldCopyOutputsFromCache = 
        // No output files to restore
        !!outputs.length &&
            // Remote caches are restored to output dirs when applied and using db cache
            (!cachedResult.remote || !(0, cache_1.dbCacheEnabled)()) &&
            // Output files have not been touched since last run
            (await this.shouldCopyOutputsFromCache(outputs, task.hash));
        if (shouldCopyOutputsFromCache) {
            await this.cache.copyFilesFromCache(task.hash, cachedResult, outputs);
        }
        const status = cachedResult.remote
            ? 'remote-cache'
            : shouldCopyOutputsFromCache
                ? 'local-cache'
                : 'local-cache-kept-existing';
        this.options.lifeCycle.printTaskTerminalOutput(task, status, cachedResult.terminalOutput);
        return {
            code: cachedResult.code,
            task,
            status,
        };
    }
    // endregion Applying Cache
    // region Batch
    async applyFromCacheOrRunBatch(doNotSkipCache, batch, groupId) {
        const applyFromCacheOrRunBatchStart = perf_hooks_1.performance.mark('TaskOrchestrator-apply-from-cache-or-run-batch:start');
        const taskEntries = Object.entries(batch.taskGraph.tasks);
        const tasks = taskEntries.map(([, task]) => task);
        // Wait for batch to be processed
        await this.processedBatches.get(batch);
        await this.preRunSteps(tasks, { groupId });
        let results = doNotSkipCache
            ? await this.applyCachedResults(tasks)
            : [];
        // Run tasks that were not cached
        if (results.length !== taskEntries.length) {
            const unrunTaskGraph = (0, utils_1.removeTasksFromTaskGraph)(batch.taskGraph, results.map(({ task }) => task.id));
            const batchResults = await this.runBatch({
                executorName: batch.executorName,
                taskGraph: unrunTaskGraph,
            }, this.batchEnv);
            results.push(...batchResults);
        }
        await this.postRunSteps(tasks, results, doNotSkipCache, { groupId });
        this.forkedProcessTaskRunner.cleanUpBatchProcesses();
        const tasksCompleted = taskEntries.filter(([taskId]) => this.completedTasks[taskId]);
        // Batch is still not done, run it again
        if (tasksCompleted.length !== taskEntries.length) {
            await this.applyFromCacheOrRunBatch(doNotSkipCache, {
                executorName: batch.executorName,
                taskGraph: (0, utils_1.removeTasksFromTaskGraph)(batch.taskGraph, tasksCompleted.map(([taskId]) => taskId)),
            }, groupId);
        }
        // Batch is done, mark it as completed
        const applyFromCacheOrRunBatchEnd = perf_hooks_1.performance.mark('TaskOrchestrator-apply-from-cache-or-run-batch:end');
        perf_hooks_1.performance.measure('TaskOrchestrator-apply-from-cache-or-run-batch', applyFromCacheOrRunBatchStart.name, applyFromCacheOrRunBatchEnd.name);
        return results;
    }
    async runBatch(batch, env) {
        const runBatchStart = perf_hooks_1.performance.mark('TaskOrchestrator-run-batch:start');
        try {
            const batchProcess = await this.forkedProcessTaskRunner.forkProcessForBatch(batch, this.projectGraph, this.taskGraph, env);
            const results = await batchProcess.getResults();
            const batchResultEntries = Object.entries(results);
            return batchResultEntries.map(([taskId, result]) => ({
                ...result,
                code: result.success ? 0 : 1,
                task: {
                    ...this.taskGraph.tasks[taskId],
                    startTime: result.startTime,
                    endTime: result.endTime,
                },
                status: (result.success ? 'success' : 'failure'),
                terminalOutput: result.terminalOutput,
            }));
        }
        catch (e) {
            return batch.taskGraph.roots.map((rootTaskId) => ({
                task: this.taskGraph.tasks[rootTaskId],
                code: 1,
                status: 'failure',
            }));
        }
        finally {
            const runBatchEnd = perf_hooks_1.performance.mark('TaskOrchestrator-run-batch:end');
            perf_hooks_1.performance.measure('TaskOrchestrator-run-batch', runBatchStart.name, runBatchEnd.name);
        }
    }
    // endregion Batch
    // region Single Task
    async applyFromCacheOrRunTask(doNotSkipCache, task, groupId) {
        // Wait for task to be processed
        const taskSpecificEnv = await this.processedTasks.get(task.id);
        await this.preRunSteps([task], { groupId });
        const pipeOutput = await this.pipeOutputCapture(task);
        // obtain metadata
        const temporaryOutputPath = this.cache.temporaryOutputPath(task);
        const streamOutput = this.outputStyle === 'static'
            ? false
            : (0, utils_1.shouldStreamOutput)(task, this.initiatingProject);
        let env = pipeOutput
            ? (0, task_env_1.getEnvVariablesForTask)(task, taskSpecificEnv, process.env.FORCE_COLOR === undefined
                ? 'true'
                : process.env.FORCE_COLOR, this.options.skipNxCache, this.options.captureStderr, null, null)
            : (0, task_env_1.getEnvVariablesForTask)(task, taskSpecificEnv, undefined, this.options.skipNxCache, this.options.captureStderr, temporaryOutputPath, streamOutput);
        let results = doNotSkipCache ? await this.applyCachedResults([task]) : [];
        // the task wasn't cached
        if (results.length === 0) {
            const childProcess = await this.runTask(task, streamOutput, env, temporaryOutputPath, pipeOutput);
            const { code, terminalOutput } = await childProcess.getResults();
            results.push({
                task,
                code,
                status: code === 0 ? 'success' : 'failure',
                terminalOutput,
            });
        }
        await this.postRunSteps([task], results, doNotSkipCache, { groupId });
        return results[0];
    }
    async runTask(task, streamOutput, env, temporaryOutputPath, pipeOutput) {
        const shouldPrefix = streamOutput && process.env.NX_PREFIX_OUTPUT === 'true';
        const targetConfiguration = (0, utils_1.getTargetConfigurationForTask)(task, this.projectGraph);
        if (process.env.NX_RUN_COMMANDS_DIRECTLY !== 'false' &&
            targetConfiguration.executor === 'nx:run-commands' &&
            !shouldPrefix) {
            try {
                const { schema } = (0, utils_1.getExecutorForTask)(task, this.projectGraph);
                const combinedOptions = (0, params_1.combineOptionsForExecutor)(task.overrides, task.target.configuration ?? targetConfiguration.defaultConfiguration, targetConfiguration, schema, task.target.project, (0, path_1.relative)(task.projectRoot ?? workspace_root_1.workspaceRoot, process.cwd()), process.env.NX_VERBOSE_LOGGING === 'true');
                if (combinedOptions.env) {
                    env = {
                        ...env,
                        ...combinedOptions.env,
                    };
                }
                if (streamOutput) {
                    const args = (0, utils_1.getPrintableCommandArgsForTask)(task);
                    output_1.output.logCommand(args.join(' '));
                }
                const runCommandsOptions = {
                    ...combinedOptions,
                    env,
                    usePty: this.tuiEnabled ||
                        (!this.tasksSchedule.hasTasks() &&
                            this.runningContinuousTasks.size === 0),
                    streamOutput,
                };
                const runningTask = await (0, run_commands_impl_1.runCommands)(runCommandsOptions, {
                    root: workspace_root_1.workspaceRoot, // only root is needed in runCommands
                });
                this.runningRunCommandsTasks.set(task.id, runningTask);
                runningTask.onExit(() => {
                    this.runningRunCommandsTasks.delete(task.id);
                });
                if (this.tuiEnabled) {
                    if (runningTask instanceof pseudo_terminal_1.PseudoTtyProcess) {
                        // This is an external of a the pseudo terminal where a task is running and can be passed to the TUI
                        this.options.lifeCycle.registerRunningTask(task.id, runningTask.getParserAndWriter());
                        runningTask.onOutput((output) => {
                            this.options.lifeCycle.appendTaskOutput(task.id, output, true);
                        });
                    }
                    else {
                        this.options.lifeCycle.registerRunningTaskWithEmptyParser(task.id);
                        runningTask.onOutput((output) => {
                            this.options.lifeCycle.appendTaskOutput(task.id, output, false);
                        });
                    }
                }
                if (!streamOutput) {
                    if (runningTask instanceof pseudo_terminal_1.PseudoTtyProcess) {
                        // TODO: shouldn't this be checking if the task is continuous before writing anything to disk or calling printTaskTerminalOutput?
                        let terminalOutput = '';
                        runningTask.onOutput((data) => {
                            terminalOutput += data;
                        });
                        runningTask.onExit((code) => {
                            this.options.lifeCycle.printTaskTerminalOutput(task, code === 0 ? 'success' : 'failure', terminalOutput);
                            (0, fs_1.writeFileSync)(temporaryOutputPath, terminalOutput);
                        });
                    }
                    else {
                        runningTask.onExit((code, terminalOutput) => {
                            this.options.lifeCycle.printTaskTerminalOutput(task, code === 0 ? 'success' : 'failure', terminalOutput);
                            (0, fs_1.writeFileSync)(temporaryOutputPath, terminalOutput);
                        });
                    }
                }
                return runningTask;
            }
            catch (e) {
                if (process.env.NX_VERBOSE_LOGGING === 'true') {
                    console.error(e);
                }
                else {
                    console.error(e.message);
                }
                const terminalOutput = e.stack ?? e.message ?? '';
                (0, fs_1.writeFileSync)(temporaryOutputPath, terminalOutput);
                return new noop_child_process_1.NoopChildProcess({
                    code: 1,
                    terminalOutput,
                });
            }
        }
        else if (targetConfiguration.executor === 'nx:noop') {
            (0, fs_1.writeFileSync)(temporaryOutputPath, '');
            return new noop_child_process_1.NoopChildProcess({
                code: 0,
                terminalOutput: '',
            });
        }
        else {
            // cache prep
            const runningTask = await this.runTaskInForkedProcess(task, env, pipeOutput, temporaryOutputPath, streamOutput);
            if (this.tuiEnabled) {
                if (runningTask instanceof pseudo_terminal_1.PseudoTtyProcess) {
                    // This is an external of a the pseudo terminal where a task is running and can be passed to the TUI
                    this.options.lifeCycle.registerRunningTask(task.id, runningTask.getParserAndWriter());
                    runningTask.onOutput((output) => {
                        this.options.lifeCycle.appendTaskOutput(task.id, output, true);
                    });
                }
                else if ('onOutput' in runningTask &&
                    typeof runningTask.onOutput === 'function') {
                    // Register task that can provide progressive output but isn't interactive (e.g., NodeChildProcessWithNonDirectOutput)
                    this.options.lifeCycle.registerRunningTaskWithEmptyParser(task.id);
                    runningTask.onOutput((output) => {
                        this.options.lifeCycle.appendTaskOutput(task.id, output, false);
                    });
                }
                else {
                    // Fallback for tasks that don't support progressive output
                    this.options.lifeCycle.registerRunningTaskWithEmptyParser(task.id);
                }
            }
            return runningTask;
        }
    }
    async runTaskInForkedProcess(task, env, pipeOutput, temporaryOutputPath, streamOutput) {
        try {
            const usePtyFork = process.env.NX_NATIVE_COMMAND_RUNNER !== 'false';
            // Disable the pseudo terminal if this is a run-many or when running a continuous task as part of a run-one
            const disablePseudoTerminal = !this.tuiEnabled && (!this.initiatingProject || task.continuous);
            // execution
            const childProcess = usePtyFork
                ? await this.forkedProcessTaskRunner.forkProcess(task, {
                    temporaryOutputPath,
                    streamOutput,
                    pipeOutput,
                    taskGraph: this.taskGraph,
                    env,
                    disablePseudoTerminal,
                })
                : await this.forkedProcessTaskRunner.forkProcessLegacy(task, {
                    temporaryOutputPath,
                    streamOutput,
                    pipeOutput,
                    taskGraph: this.taskGraph,
                    env,
                });
            return childProcess;
        }
        catch (e) {
            if (process.env.NX_VERBOSE_LOGGING === 'true') {
                console.error(e);
            }
            return new noop_child_process_1.NoopChildProcess({
                code: 1,
                terminalOutput: undefined,
            });
        }
    }
    async startContinuousTask(task, groupId) {
        if (this.runningTasksService &&
            this.runningTasksService.getRunningTasks([task.id]).length) {
            await this.preRunSteps([task], { groupId });
            if (this.tuiEnabled) {
                this.options.lifeCycle.setTaskStatus(task.id, 8 /* NativeTaskStatus.Shared */);
            }
            const runningTask = new shared_running_task_1.SharedRunningTask(this.runningTasksService, task.id);
            this.runningContinuousTasks.set(task.id, runningTask);
            runningTask.onExit(() => {
                if (this.tuiEnabled) {
                    this.options.lifeCycle.setTaskStatus(task.id, 9 /* NativeTaskStatus.Stopped */);
                }
                this.runningContinuousTasks.delete(task.id);
            });
            // task is already running by another process, we schedule the next tasks
            // and release the threads
            await this.scheduleNextTasksAndReleaseThreads();
            if (this.initializingTaskIds.has(task.id)) {
                await new Promise((res) => {
                    runningTask.onExit((code) => {
                        if (!this.tuiEnabled) {
                            if (code > 128) {
                                process.exit(code);
                            }
                        }
                        res();
                    });
                });
            }
            return runningTask;
        }
        const taskSpecificEnv = await this.processedTasks.get(task.id);
        await this.preRunSteps([task], { groupId });
        const pipeOutput = await this.pipeOutputCapture(task);
        // obtain metadata
        const temporaryOutputPath = this.cache.temporaryOutputPath(task);
        const streamOutput = this.outputStyle === 'static'
            ? false
            : (0, utils_1.shouldStreamOutput)(task, this.initiatingProject);
        let env = pipeOutput
            ? (0, task_env_1.getEnvVariablesForTask)(task, taskSpecificEnv, process.env.FORCE_COLOR === undefined
                ? 'true'
                : process.env.FORCE_COLOR, this.options.skipNxCache, this.options.captureStderr, null, null)
            : (0, task_env_1.getEnvVariablesForTask)(task, taskSpecificEnv, undefined, this.options.skipNxCache, this.options.captureStderr, temporaryOutputPath, streamOutput);
        const childProcess = await this.runTask(task, streamOutput, env, temporaryOutputPath, pipeOutput);
        this.runningTasksService.addRunningTask(task.id);
        this.runningContinuousTasks.set(task.id, childProcess);
        childProcess.onExit(() => {
            if (this.tuiEnabled) {
                this.options.lifeCycle.setTaskStatus(task.id, 9 /* NativeTaskStatus.Stopped */);
            }
            if (this.runningContinuousTasks.delete(task.id)) {
                this.runningTasksService.removeRunningTask(task.id);
            }
        });
        await this.scheduleNextTasksAndReleaseThreads();
        if (this.initializingTaskIds.has(task.id)) {
            await new Promise((res) => {
                childProcess.onExit((code) => {
                    if (!this.tuiEnabled) {
                        if (code > 128) {
                            process.exit(code);
                        }
                    }
                    res();
                });
            });
        }
        return childProcess;
    }
    // endregion Single Task
    // region Lifecycle
    async preRunSteps(tasks, metadata) {
        const now = Date.now();
        for (const task of tasks) {
            task.startTime = now;
        }
        await this.options.lifeCycle.startTasks(tasks, metadata);
    }
    async postRunSteps(tasks, results, doNotSkipCache, { groupId }) {
        const now = Date.now();
        for (const task of tasks) {
            task.endTime = now;
            await this.recordOutputsHash(task);
        }
        if (doNotSkipCache) {
            // cache the results
            perf_hooks_1.performance.mark('cache-results-start');
            await Promise.all(results
                .filter(({ status }) => status !== 'local-cache' &&
                status !== 'local-cache-kept-existing' &&
                status !== 'remote-cache' &&
                status !== 'skipped')
                .map((result) => ({
                ...result,
                code: result.status === 'local-cache' ||
                    result.status === 'local-cache-kept-existing' ||
                    result.status === 'remote-cache' ||
                    result.status === 'success'
                    ? 0
                    : 1,
                outputs: result.task.outputs,
            }))
                .filter(({ task, code }) => this.shouldCacheTaskResult(task, code))
                .filter(({ terminalOutput, outputs }) => terminalOutput || outputs)
                .map(async ({ task, code, terminalOutput, outputs }) => this.cache.put(task, terminalOutput, outputs, code)));
            perf_hooks_1.performance.mark('cache-results-end');
            perf_hooks_1.performance.measure('cache-results', 'cache-results-start', 'cache-results-end');
        }
        await this.options.lifeCycle.endTasks(results.map((result) => {
            const code = result.status === 'success' ||
                result.status === 'local-cache' ||
                result.status === 'local-cache-kept-existing' ||
                result.status === 'remote-cache'
                ? 0
                : 1;
            return {
                ...result,
                task: result.task,
                status: result.status,
                code,
            };
        }), { groupId });
        this.complete(results.map(({ task, status }) => {
            return {
                taskId: task.id,
                status,
            };
        }));
        await this.scheduleNextTasksAndReleaseThreads();
    }
    async scheduleNextTasksAndReleaseThreads() {
        await this.tasksSchedule.scheduleNextTasks();
        // release blocked threads
        this.waitingForTasks.forEach((f) => f(null));
        this.waitingForTasks.length = 0;
    }
    complete(taskResults) {
        this.tasksSchedule.complete(taskResults.map(({ taskId }) => taskId));
        this.cleanUpUnneededContinuousTasks();
        for (const { taskId, status } of taskResults) {
            if (this.completedTasks[taskId] === undefined) {
                this.completedTasks[taskId] = status;
                if (this.tuiEnabled) {
                    this.options.lifeCycle.setTaskStatus(taskId, (0, native_1.parseTaskStatus)(status));
                }
                if (status === 'failure' || status === 'skipped') {
                    if (this.bail) {
                        // mark the execution as bailed which will stop all further execution
                        // only the tasks that are currently running will finish
                        this.bailed = true;
                    }
                    else {
                        // only mark the packages that depend on the current task as skipped
                        // other tasks will continue to execute
                        this.complete(this.reverseTaskDeps[taskId].map((depTaskId) => ({
                            taskId: depTaskId,
                            status: 'skipped',
                        })));
                    }
                }
            }
        }
    }
    //endregion Lifecycle
    // region utils
    async pipeOutputCapture(task) {
        try {
            if (process.env.NX_NATIVE_COMMAND_RUNNER !== 'false') {
                return true;
            }
            const { schema } = (0, utils_1.getExecutorForTask)(task, this.projectGraph);
            return (schema.outputCapture === 'pipe' ||
                process.env.NX_STREAM_OUTPUT === 'true');
        }
        catch (e) {
            return false;
        }
    }
    shouldCacheTaskResult(task, code) {
        return ((0, utils_1.isCacheableTask)(task, this.options) &&
            (process.env.NX_CACHE_FAILURES == 'true' ? true : code === 0));
    }
    closeGroup() {
        for (let i = 0; i < this.options.parallel; i++) {
            if (!this.groups[i]) {
                this.groups[i] = true;
                return i;
            }
        }
    }
    openGroup(id) {
        this.groups[id] = false;
    }
    async shouldCopyOutputsFromCache(outputs, hash) {
        if (this.daemon?.enabled()) {
            return !(await this.daemon.outputsHashesMatch(outputs, hash));
        }
        else {
            return true;
        }
    }
    async recordOutputsHash(task) {
        if (this.daemon?.enabled()) {
            return this.daemon.recordOutputsHash(task.outputs, task.hash);
        }
    }
    // endregion utils
    async cleanup() {
        this.forkedProcessTaskRunner.cleanup();
        await Promise.all([
            ...Array.from(this.runningContinuousTasks).map(async ([taskId, t]) => {
                try {
                    await t.kill();
                    this.options.lifeCycle.setTaskStatus?.(taskId, 9 /* NativeTaskStatus.Stopped */);
                }
                catch (e) {
                    console.error(`Unable to terminate ${taskId}\nError:`, e);
                }
                finally {
                    if (this.runningContinuousTasks.delete(taskId)) {
                        this.runningTasksService.removeRunningTask(taskId);
                    }
                }
            }),
            ...Array.from(this.runningRunCommandsTasks).map(async ([taskId, t]) => {
                try {
                    await t.kill();
                }
                catch (e) {
                    console.error(`Unable to terminate ${taskId}\nError:`, e);
                }
            }),
        ]);
    }
    cleanUpUnneededContinuousTasks() {
        const incompleteTasks = this.tasksSchedule.getIncompleteTasks();
        const neededContinuousTasks = new Set(this.initializingTaskIds);
        for (const task of incompleteTasks) {
            const continuousDependencies = this.taskGraph.continuousDependencies[task.id];
            for (const continuousDependency of continuousDependencies) {
                neededContinuousTasks.add(continuousDependency);
            }
        }
        for (const taskId of this.runningContinuousTasks.keys()) {
            if (!neededContinuousTasks.has(taskId)) {
                const runningTask = this.runningContinuousTasks.get(taskId);
                if (runningTask) {
                    runningTask.kill();
                    this.options.lifeCycle.setTaskStatus?.(taskId, 9 /* NativeTaskStatus.Stopped */);
                }
            }
        }
    }
}
exports.TaskOrchestrator = TaskOrchestrator;
function getThreadCount(options, taskGraph) {
    if (options['parallel'] === 'false' ||
        options['parallel'] === false) {
        options['parallel'] = 1;
    }
    else if (options['parallel'] === 'true' ||
        options['parallel'] === true ||
        options['parallel'] === undefined ||
        options['parallel'] === '') {
        options['parallel'] = Number(options['maxParallel'] || 3);
    }
    const maxParallel = options['parallel'] +
        Object.values(taskGraph.tasks).filter((t) => t.continuous).length;
    const totalTasks = Object.keys(taskGraph.tasks).length;
    return Math.min(maxParallel, totalTasks);
}
