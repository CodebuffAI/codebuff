import { Task } from '../../config/task-graph';
import { LifeCycle, TaskResult } from '../life-cycle';
export declare class LegacyTaskHistoryLifeCycle implements LifeCycle {
    private startTimings;
    private taskRuns;
    private flakyTasks;
    startTasks(tasks: Task[]): void;
    endTasks(taskResults: TaskResult[]): Promise<void>;
    endCommand(): Promise<void>;
    printFlakyTasksMessage(): void;
}
//# sourceMappingURL=task-history-life-cycle-old.d.ts.map