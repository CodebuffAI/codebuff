import { Task } from '../config/task-graph';
import { ExternalObject, TaskStatus as NativeTaskStatus } from '../native';
import { TaskStatus } from './tasks-runner';
/**
 * The result of a completed {@link Task}
 */
export interface TaskResult {
    task: Task;
    status: TaskStatus;
    code: number;
    terminalOutput?: string;
}
/**
 * A map of {@link TaskResult} keyed by the ID of the completed {@link Task}s
 */
export type TaskResults = Record<string, TaskResult>;
export interface TaskMetadata {
    groupId: number;
}
export interface LifeCycle {
    startCommand?(parallel?: number): void | Promise<void>;
    endCommand?(): void | Promise<void>;
    scheduleTask?(task: Task): void | Promise<void>;
    /**
     * @deprecated use startTasks
     *
     * startTask won't be supported after Nx 14 is released.
     */
    startTask?(task: Task): void;
    /**
     * @deprecated use endTasks
     *
     * endTask won't be supported after Nx 14 is released.
     */
    endTask?(task: Task, code: number): void;
    startTasks?(task: Task[], metadata: TaskMetadata): void | Promise<void>;
    endTasks?(taskResults: TaskResult[], metadata: TaskMetadata): void | Promise<void>;
    printTaskTerminalOutput?(task: Task, status: TaskStatus, output: string): void;
    registerRunningTask?(taskId: string, parserAndWriter: ExternalObject<[any, any]>): void;
    registerRunningTaskWithEmptyParser?(taskId: string): void;
    appendTaskOutput?(taskId: string, output: string, isPtyTask: boolean): void;
    setTaskStatus?(taskId: string, status: NativeTaskStatus): void;
    registerForcedShutdownCallback?(callback: () => void): void;
    setEstimatedTaskTimings?(timings: Record<string, number>): void;
}
export declare class CompositeLifeCycle implements LifeCycle {
    private readonly lifeCycles;
    constructor(lifeCycles: LifeCycle[]);
    startCommand(parallel?: number): Promise<void>;
    endCommand(): Promise<void>;
    scheduleTask(task: Task): Promise<void>;
    startTask(task: Task): void;
    endTask(task: Task, code: number): void;
    startTasks(tasks: Task[], metadata: TaskMetadata): Promise<void>;
    endTasks(taskResults: TaskResult[], metadata: TaskMetadata): Promise<void>;
    printTaskTerminalOutput(task: Task, status: TaskStatus, output: string): void;
    registerRunningTask(taskId: string, parserAndWriter: ExternalObject<[any, any]>): void;
    registerRunningTaskWithEmptyParser(taskId: string): void;
    appendTaskOutput(taskId: string, output: string, isPtyTask: boolean): void;
    setTaskStatus(taskId: string, status: NativeTaskStatus): void;
    registerForcedShutdownCallback(callback: () => void): void;
    setEstimatedTaskTimings(timings: Record<string, number>): void;
}
//# sourceMappingURL=life-cycle.d.ts.map