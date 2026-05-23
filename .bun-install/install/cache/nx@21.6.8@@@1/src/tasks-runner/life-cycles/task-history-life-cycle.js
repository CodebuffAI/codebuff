"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskHistoryLifeCycle = void 0;
exports.getTasksHistoryLifeCycle = getTasksHistoryLifeCycle;
const nx_json_1 = require("../../config/nx-json");
const native_1 = require("../../native");
const nx_cloud_utils_1 = require("../../utils/nx-cloud-utils");
const output_1 = require("../../utils/output");
const serialize_target_1 = require("../../utils/serialize-target");
const task_history_1 = require("../../utils/task-history");
const is_tui_enabled_1 = require("../is-tui-enabled");
const task_history_life_cycle_old_1 = require("./task-history-life-cycle-old");
let tasksHistoryLifeCycle;
function getTasksHistoryLifeCycle() {
    if (!tasksHistoryLifeCycle) {
        tasksHistoryLifeCycle =
            process.env.NX_DISABLE_DB !== 'true' && !native_1.IS_WASM
                ? new TaskHistoryLifeCycle()
                : new task_history_life_cycle_old_1.LegacyTaskHistoryLifeCycle();
    }
    return tasksHistoryLifeCycle;
}
class TaskHistoryLifeCycle {
    constructor() {
        this.startTimings = {};
        this.taskRuns = new Map();
        this.taskHistory = (0, task_history_1.getTaskHistory)();
        if (tasksHistoryLifeCycle) {
            throw new Error('TaskHistoryLifeCycle is a singleton and should not be instantiated multiple times');
        }
        tasksHistoryLifeCycle = this;
    }
    startTasks(tasks) {
        for (let task of tasks) {
            this.startTimings[task.id] = new Date().getTime();
        }
    }
    async endTasks(taskResults) {
        taskResults
            .map((taskResult) => ({
            hash: taskResult.task.hash,
            target: taskResult.task.target,
            code: taskResult.code,
            status: taskResult.status,
            start: taskResult.task.startTime ?? this.startTimings[taskResult.task.id],
            end: taskResult.task.endTime ?? Date.now(),
        }))
            .forEach((taskRun) => {
            this.taskRuns.set(taskRun.hash, taskRun);
        });
    }
    async endCommand() {
        const entries = Array.from(this.taskRuns);
        if (!this.taskHistory) {
            return;
        }
        await this.taskHistory.recordTaskRuns(entries.map(([_, v]) => v));
        this.flakyTasks = await this.taskHistory.getFlakyTasks(entries.map(([hash]) => hash));
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
                    ...this.flakyTasks.map((hash) => {
                        const taskRun = this.taskRuns.get(hash);
                        return `  ${(0, serialize_target_1.serializeTarget)(taskRun.target.project, taskRun.target.target, taskRun.target.configuration)}`;
                    }),
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
exports.TaskHistoryLifeCycle = TaskHistoryLifeCycle;
