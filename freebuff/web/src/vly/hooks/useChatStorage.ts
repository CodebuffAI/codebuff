import { useState, useEffect, useCallback, useRef } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Descendant } from "slate";
import { Range } from "slate";

export interface SelectedNodeInfo {
  selector: string;
  reactHierarchyFormatted: string;
  image?: string;
}

interface ChatStorageState {
  editorValue: Descendant[];
  uploadedImages: Id<"_storage">[];
  selection: Range | null;
  selectedNodeInfo: SelectedNodeInfo | null;
  timestamp: number;
}

const STORAGE_KEY_PREFIX = "chatInput";

const getStorageKeys = (projectId: string) => ({
  EDITOR_VALUE: `${STORAGE_KEY_PREFIX}_${projectId}_editorValue`,
  UPLOADED_IMAGES: `${STORAGE_KEY_PREFIX}_${projectId}_images`,
  SELECTION: `${STORAGE_KEY_PREFIX}_${projectId}_selection`,
  SELECTED_NODE_INFO: `${STORAGE_KEY_PREFIX}_${projectId}_selectedNodeInfo`,
});

export const useChatStorage = (projectSemanticIdentifier: string) => {
  const [editorValue, setEditorValue] = useState<Descendant[]>([
    {
      type: "paragraph",
      children: [{ text: "" }],
    },
  ]);
  const [uploadedImages, setUploadedImages] = useState<Id<"_storage">[]>([]);
  const [selection, setSelection] = useState<Range | null>(null);
  const [selectedNodeInfo, setSelectedNodeInfo] =
    useState<SelectedNodeInfo | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Debounce refs for different storage operations
  const editorSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imageSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectionSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nodeInfoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const storageKeys = getStorageKeys(projectSemanticIdentifier);

  // Combined hydration and localStorage loading effect
  useEffect(() => {
    setIsHydrated(true);

    // Load from localStorage after hydration
    try {
      const savedEditorValue = localStorage.getItem(storageKeys.EDITOR_VALUE);
      const savedImages = localStorage.getItem(storageKeys.UPLOADED_IMAGES);
      const savedSelection = localStorage.getItem(storageKeys.SELECTION);
      const savedSelectedNodeInfo = localStorage.getItem(
        storageKeys.SELECTED_NODE_INFO,
      );

      if (savedEditorValue) {
        try {
          const parsedEditorValue = JSON.parse(savedEditorValue);
          // Validate that it's a proper Slate structure
          if (
            Array.isArray(parsedEditorValue) &&
            parsedEditorValue.length > 0
          ) {
            setEditorValue(parsedEditorValue);
          }
        } catch (error) {
          console.error("Error parsing saved editor value:", error);
          localStorage.removeItem(storageKeys.EDITOR_VALUE);
        }
      }

      if (savedImages) {
        try {
          const parsedImages = JSON.parse(savedImages);
          if (Array.isArray(parsedImages)) {
            setUploadedImages(parsedImages);
          }
        } catch (error) {
          console.error("Error parsing saved images:", error);
          localStorage.removeItem(storageKeys.UPLOADED_IMAGES);
        }
      }

      if (savedSelection) {
        try {
          const parsedSelection = JSON.parse(savedSelection);
          // Validate that it's a proper Range structure
          if (
            parsedSelection &&
            typeof parsedSelection === "object" &&
            parsedSelection.anchor &&
            parsedSelection.focus &&
            Array.isArray(parsedSelection.anchor.path) &&
            Array.isArray(parsedSelection.focus.path)
          ) {
            setSelection(parsedSelection);
          }
        } catch (error) {
          console.error("Error parsing saved selection:", error);
          localStorage.removeItem(storageKeys.SELECTION);
        }
      }

      if (savedSelectedNodeInfo) {
        try {
          const parsedSelectedNodeInfo = JSON.parse(savedSelectedNodeInfo);
          // Validate that it's a proper SelectedNodeInfo structure
          if (
            parsedSelectedNodeInfo &&
            typeof parsedSelectedNodeInfo === "object" &&
            typeof parsedSelectedNodeInfo.selector === "string" &&
            typeof parsedSelectedNodeInfo.reactHierarchyFormatted === "string"
          ) {
            setSelectedNodeInfo(parsedSelectedNodeInfo);
          }
        } catch (error) {
          console.error("Error parsing saved selected node info:", error);
          localStorage.removeItem(storageKeys.SELECTED_NODE_INFO);
        }
      }
    } catch (error) {
      console.error("Error loading from localStorage:", error);
    }
  }, [
    projectSemanticIdentifier,
    storageKeys.EDITOR_VALUE,
    storageKeys.UPLOADED_IMAGES,
    storageKeys.SELECTION,
    storageKeys.SELECTED_NODE_INFO,
  ]);

  // Update editor value with debounced localStorage save
  const updateEditorValue = useCallback(
    (value: Descendant[]) => {
      setEditorValue(value);

      // Clear existing timeout
      if (editorSaveTimeoutRef.current) {
        clearTimeout(editorSaveTimeoutRef.current);
      }

      // Save after 500ms of no typing (slightly longer than hero since rich text is more complex)
      editorSaveTimeoutRef.current = setTimeout(() => {
        try {
          // Check if editor has meaningful content
          const hasContent = value.some((node: any) =>
            node.children?.some((child: any) => child.text?.trim()),
          );

          if (hasContent) {
            localStorage.setItem(
              storageKeys.EDITOR_VALUE,
              JSON.stringify(value),
            );
          } else {
            localStorage.removeItem(storageKeys.EDITOR_VALUE);
          }
        } catch (error) {
          console.error("Error saving editor value:", error);
        }
      }, 500);
    },
    [storageKeys.EDITOR_VALUE],
  );

  // Helper function to save images with debouncing
  const saveImagesDebounced = useCallback(
    (images: Id<"_storage">[]) => {
      // Clear existing timeout
      if (imageSaveTimeoutRef.current) {
        clearTimeout(imageSaveTimeoutRef.current);
      }

      // Save after 50ms to batch rapid image operations
      imageSaveTimeoutRef.current = setTimeout(() => {
        try {
          if (images.length > 0) {
            localStorage.setItem(
              storageKeys.UPLOADED_IMAGES,
              JSON.stringify(images),
            );
          } else {
            localStorage.removeItem(storageKeys.UPLOADED_IMAGES);
          }
        } catch (error) {
          console.error("Error saving images:", error);
        }
      }, 50);
    },
    [storageKeys.UPLOADED_IMAGES],
  );

  // Update selection with debounced localStorage save
  const updateSelection = useCallback(
    (newSelection: Range | null) => {
      setSelection(newSelection);

      // Clear existing timeout
      if (selectionSaveTimeoutRef.current) {
        clearTimeout(selectionSaveTimeoutRef.current);
      }

      // Save after 100ms to avoid too many saves during typing
      selectionSaveTimeoutRef.current = setTimeout(() => {
        try {
          if (newSelection) {
            localStorage.setItem(
              storageKeys.SELECTION,
              JSON.stringify(newSelection),
            );
          } else {
            localStorage.removeItem(storageKeys.SELECTION);
          }
        } catch (error) {
          console.error("Error saving selection:", error);
        }
      }, 100);
    },
    [storageKeys.SELECTION],
  );

  // Update selected node info with debounced localStorage save
  const updateSelectedNodeInfo = useCallback(
    (nodeInfo: SelectedNodeInfo | null) => {
      setSelectedNodeInfo(nodeInfo);

      // Clear existing timeout
      if (nodeInfoSaveTimeoutRef.current) {
        clearTimeout(nodeInfoSaveTimeoutRef.current);
      }

      // Save after 50ms (quick save since node selection is less frequent)
      nodeInfoSaveTimeoutRef.current = setTimeout(() => {
        try {
          if (nodeInfo) {
            localStorage.setItem(
              storageKeys.SELECTED_NODE_INFO,
              JSON.stringify(nodeInfo),
            );
          } else {
            localStorage.removeItem(storageKeys.SELECTED_NODE_INFO);
          }
        } catch (error) {
          console.error("Error saving selected node info:", error);
        }
      }, 50);
    },
    [storageKeys.SELECTED_NODE_INFO],
  );

  // Add images with debounced localStorage save
  const addImages = useCallback(
    (newImages: Id<"_storage">[]) => {
      setUploadedImages((prev) => {
        const updatedImages = [...prev, ...newImages];
        saveImagesDebounced(updatedImages);
        return updatedImages;
      });
    },
    [saveImagesDebounced],
  );

  // Remove image with debounced localStorage update
  const removeImage = useCallback(
    (index: number) => {
      setUploadedImages((prev) => {
        const updatedImages = prev.filter((_, i) => i !== index);
        saveImagesDebounced(updatedImages);
        return updatedImages;
      });
    },
    [saveImagesDebounced],
  );

  // Clear all storage (called after successful message send)
  const clearAllStorage = useCallback(() => {
    try {
      localStorage.removeItem(storageKeys.EDITOR_VALUE);
      localStorage.removeItem(storageKeys.UPLOADED_IMAGES);
      localStorage.removeItem(storageKeys.SELECTION);
      localStorage.removeItem(storageKeys.SELECTED_NODE_INFO);

      // Reset state to empty editor
      setEditorValue([
        {
          type: "paragraph",
          children: [{ text: "" }],
        },
      ]);
      setUploadedImages([]);
      setSelection(null);
      setSelectedNodeInfo(null);

      // Clear any pending saves
      if (editorSaveTimeoutRef.current) {
        clearTimeout(editorSaveTimeoutRef.current);
      }
      if (imageSaveTimeoutRef.current) {
        clearTimeout(imageSaveTimeoutRef.current);
      }
      if (selectionSaveTimeoutRef.current) {
        clearTimeout(selectionSaveTimeoutRef.current);
      }
      if (nodeInfoSaveTimeoutRef.current) {
        clearTimeout(nodeInfoSaveTimeoutRef.current);
      }
    } catch (error) {
      console.error("Error clearing storage:", error);
    }
  }, [
    storageKeys.EDITOR_VALUE,
    storageKeys.UPLOADED_IMAGES,
    storageKeys.SELECTION,
    storageKeys.SELECTED_NODE_INFO,
  ]);

  // Save current state immediately (useful for pre-submit saves)
  const saveCurrentState = useCallback(() => {
    try {
      // Check if editor has meaningful content
      const hasContent = editorValue.some((node: any) =>
        node.children?.some((child: any) => child.text?.trim()),
      );

      if (hasContent) {
        localStorage.setItem(
          storageKeys.EDITOR_VALUE,
          JSON.stringify(editorValue),
        );
      }
      if (uploadedImages.length > 0) {
        localStorage.setItem(
          storageKeys.UPLOADED_IMAGES,
          JSON.stringify(uploadedImages),
        );
      }
      if (selection) {
        localStorage.setItem(storageKeys.SELECTION, JSON.stringify(selection));
      }
      if (selectedNodeInfo) {
        localStorage.setItem(
          storageKeys.SELECTED_NODE_INFO,
          JSON.stringify(selectedNodeInfo),
        );
      }
    } catch (error) {
      console.error("Error saving current state:", error);
    }
  }, [
    editorValue,
    uploadedImages,
    selection,
    selectedNodeInfo,
    storageKeys.EDITOR_VALUE,
    storageKeys.UPLOADED_IMAGES,
    storageKeys.SELECTION,
    storageKeys.SELECTED_NODE_INFO,
  ]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (editorSaveTimeoutRef.current) {
        clearTimeout(editorSaveTimeoutRef.current);
      }
      if (imageSaveTimeoutRef.current) {
        clearTimeout(imageSaveTimeoutRef.current);
      }
      if (selectionSaveTimeoutRef.current) {
        clearTimeout(selectionSaveTimeoutRef.current);
      }
      if (nodeInfoSaveTimeoutRef.current) {
        clearTimeout(nodeInfoSaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    editorValue,
    uploadedImages,
    selection,
    selectedNodeInfo,
    isHydrated,

    // Actions
    updateEditorValue,
    updateSelection,
    updateSelectedNodeInfo,
    addImages,
    removeImage,
    clearAllStorage,
    saveCurrentState,
  };
};
