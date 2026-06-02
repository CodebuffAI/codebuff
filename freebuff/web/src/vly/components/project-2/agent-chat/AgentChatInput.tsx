"use client";

import { ChatInput } from "../ChatInput";
import { Id } from "@/convex/_generated/dataModel";

interface AgentChatInputProps {
  isProcessing: boolean;
  handleSendMessage: (
    message: string,
    images: Id<"_storage">[],
  ) => Promise<boolean>;
  projectSemanticIdentifier: string;
  projectId?: Id<"project">;
}

export function AgentChatInput({
  isProcessing,
  handleSendMessage,
  projectSemanticIdentifier,
  projectId,
}: AgentChatInputProps) {
  // Reuse the existing ChatInput component with agent-specific props
  return (
    <ChatInput
      isProcessing={isProcessing}
      handleSendMessage={handleSendMessage}
      projectSemanticIdentifier={projectSemanticIdentifier}
      terminateThread={async () => {}}
      isSelectingElement={false}
      setIsSelectingElement={() => {}}
      projectId={projectId}
      onOpenDivergenceDialog={() => {}}
      queuedMessages={[]}
      onRemoveQueuedMessage={() => {}}
      externalSelectedNodeInfo={null}
      onSelectedNodeInfoChange={() => {}}
      onUserInputChange={() => {}}
      selectedAgentMode="POWERFUL"
      onAgentModeChange={() => {}}
      syncStatus={undefined}
      activeEntryPointId={undefined}
    />
  );
}
