"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useChatStorage } from "@/vly/hooks/useChatStorage";
import { Id } from "@/convex/_generated/dataModel";
import { Descendant } from "slate";
import { Range } from "slate";

interface SelectedNodeInfo {
  selector: string;
  reactHierarchyFormatted: string;
  image?: string;
}

interface ChatStorageContextType {
  editorValue: Descendant[];
  uploadedImages: Id<"_storage">[];
  selection: Range | null;
  selectedNodeInfo: SelectedNodeInfo | null;
  isHydrated: boolean;
  updateEditorValue: (value: Descendant[]) => void;
  updateSelection: (selection: Range | null) => void;
  updateSelectedNodeInfo: (nodeInfo: SelectedNodeInfo | null) => void;
  addImages: (images: Id<"_storage">[]) => void;
  removeImage: (index: number) => void;
  clearAllStorage: () => void;
  saveCurrentState: () => void;
}

const ChatStorageContext = createContext<ChatStorageContextType | null>(null);

export const ChatStorageProvider: React.FC<{
  children: ReactNode;
  projectSemanticIdentifier: string;
}> = ({ children, projectSemanticIdentifier }) => {
  const chatStorage = useChatStorage(projectSemanticIdentifier);

  return (
    <ChatStorageContext.Provider value={chatStorage}>
      {children}
    </ChatStorageContext.Provider>
  );
};

export const useChatStorageContext = () => {
  const context = useContext(ChatStorageContext);
  if (!context) {
    throw new Error(
      "useChatStorageContext must be used within a ChatStorageProvider",
    );
  }
  return context;
};
