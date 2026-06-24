import type { Doc } from "../../../_generated/dataModel";
import { DaytonaCodebase } from "../../../../codebase-utils/codebase/DaytonaCodebase";

export interface ConnectionStrategy {
  warmConnection(project: Doc<"project">, codebase: DaytonaCodebase): Promise<void>;
}
