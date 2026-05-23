"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyTaskHistoryLifeCycle = void 0;
const nx_json_1 = require("../../config/nx-json");
const legacy_task_history_1 = require("../../utils/legacy-task-history");
const nx_cloud_utils_1 = require("../../utils/nx-cloud-utils");
const output_1 = require("../../utils/output");
const serialize_target_1 = require("../../utils/serialize-target");
const is_tui_enabled_1 = require("../is-tui-enabled");
class LegacyTaskHistoryLifeCycle {
    constructor() {
        this.startTimings = {};
        this.taskRuns = [];
    }
    startTasks(tasks) {
        for (let task of tasks) {
            this.startTimings[task.id] = new Date().getTime();
        }
    }
    async endTasks(taskResults) {
        const taskRuns = taskResults.map((taskResult) => ({
            project: taskResult.task.target.project,
            target: taskResult.task.target.target,
            configuration: taskResult.task.target.configuration,
            hash: taskResult.task.hash,
            code: taskResult.code.toString(),
            status: taskResult.status,
            start: (taskResult.task.startTime ?? this.startTimings[taskResult.task.id]).toString(),
            end: (taskResult.task.endTime ?? new Date().getTime()).toString(),
        }));
        this.taskRuns.push(...taskRuns);
    }
    async endCommand() {
        await (0, legacy_task_history_1.writeTaskRunsToHistory)(this.taskRuns);
        const history = await (0, legacy_task_history_1.getHistoryForHashes)(this.taskRuns.map((t) => t.hash));
        this.flakyTasks = [];
        // check if any hash has different exit codes => flaky
        for (let hash in history) {
            if (history[hash].length > 1 &&
                history[hash].some((run) => run.code !== history[hash][0].code)) {
                this.flakyTasks.push((0, serialize_target_1.serializeTarget)(history[hash][0].project, history[hash][0].target, history[hash][0].configuration));
            }
        }
        // Do not directly print output when using the TUI
        if ((0, is_tui_enabled_1.isTuiEnabled)()) {
            return;
        }
        this.printFlakyTasksMessage();
    }
    printFlakyTasksMessage() {
        if (this.flakyTasks?.length > 0) {
            output_1.output.warn({
                title: `Nx detected ${this.flakyTasks.length === 1 ? 'a flaky task' : ' flaky tasks'}`,
                bodyLines: [
                    ,
                    ...this.flakyTasks.map((t) => `  ${t}`),
                    ...((0, nx_cloud_utils_1.isNxCloudUsed)((0, nx_json_1.readNxJson)())
                        ? []
                        : [
                            '',
                            `Flaky tasks can disrupt your CI pipeline. Automatically retry them with Nx Cloud. Learn more at https://nx.dev/ci/features/flaky-tasks`,
                        ]),
                ],
            });
        }
    }
}
exports.LegacyTaskHistoryLifeCycle = LegacyTaskHistoryLifeCycle;
