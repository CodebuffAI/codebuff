import { Doc, Id } from "!/_generated/dataModel";

export type ContextMember = Pick<Doc<"users">, "_id" | "name" | "email">;

export type ContextProjectIntegration = Pick<
  Doc<"integration">,
  "_id" | "title" | "description" | "env_variables"
>;

export type ContextMessage = {
  _id: Id<"messages">;
  _creationTime: number;
  role: "user" | "assistant";
  content: string;
  date: number;
  thread_id?: Id<"thread">;
  images?: Id<"_storage">[];
  object?: string;
  result?: string;
  summarization?: string;
  compact_summarization?: string;
  code_summarization?: string;
  tool_call?: string;
  error_check?: string;
  file_apply_results?: Doc<"messages">["file_apply_results"];
  core_message?: string;
  pageContext?: string;
};
