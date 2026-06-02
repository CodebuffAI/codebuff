import { useState, useEffect, useCallback, useRef } from "react";
import { Id } from "@/convex/_generated/dataModel";
import { isThemeName } from "@/vly/lib/theme-prompts";

const STORAGE_KEYS = {
  USER_INPUT: "heroInput",
  UPLOADED_IMAGES: "heroImages",
  UPLOADED_IMAGE_IDS: "heroImageIds",
  SELECTED_THEME: "heroTheme",
} as const;

function normalizeStoredTheme(theme: string | null): string {
  if (!theme) return "";
  return theme === "none" || isThemeName(theme) ? theme : "";
}

export const useHeroStorage = () => {
  const [userInput, setUserInput] = useState("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedImageIds, setUploadedImageIds] = useState<Id<"_storage">[]>(
    [],
  );
  const [selectedTheme, setSelectedTheme] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  // Debounce refs for different storage operations
  const textSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const themeSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const imageSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Combined hydration and localStorage loading effect
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsHydrated(true);

    // Load from localStorage after hydration
    try {
      const savedInput = localStorage.getItem(STORAGE_KEYS.USER_INPUT);
      const savedImages = localStorage.getItem(STORAGE_KEYS.UPLOADED_IMAGES);
      const savedImageIds = localStorage.getItem(
        STORAGE_KEYS.UPLOADED_IMAGE_IDS,
      );
      const savedTheme = localStorage.getItem(STORAGE_KEYS.SELECTED_THEME);

      if (savedInput) {
        setUserInput(savedInput);
      }

      if (savedImages) {
        try {
          const parsedImages = JSON.parse(savedImages);
          setUploadedImages(parsedImages);
        } catch (error) {
          console.error("Error parsing saved images:", error);
          localStorage.removeItem(STORAGE_KEYS.UPLOADED_IMAGES);
        }
      }

      if (savedImageIds) {
        try {
          const parsedImageIds = JSON.parse(savedImageIds);
          setUploadedImageIds(parsedImageIds);
        } catch (error) {
          console.error("Error parsing saved image IDs:", error);
          localStorage.removeItem(STORAGE_KEYS.UPLOADED_IMAGE_IDS);
        }
      }

      const normalizedTheme = normalizeStoredTheme(savedTheme);
      if (normalizedTheme) {
        setSelectedTheme(normalizedTheme);
      } else if (savedTheme) {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_THEME);
      }
    } catch (error) {
      console.error("Error loading from localStorage:", error);
    }
  }, []);

  // Update text input with debounced localStorage save
  const updateUserInput = useCallback((text: string) => {
    setUserInput(text);

    // Clear existing timeout
    if (textSaveTimeoutRef.current) {
      clearTimeout(textSaveTimeoutRef.current);
    }

    // Save after 300ms of no typing
    textSaveTimeoutRef.current = setTimeout(() => {
      try {
        if (text.trim()) {
          localStorage.setItem(STORAGE_KEYS.USER_INPUT, text);
        } else {
          localStorage.removeItem(STORAGE_KEYS.USER_INPUT);
        }
      } catch (error) {
        console.error("Error saving user input:", error);
      }
    }, 300);
  }, []);

  // Helper function to save images with debouncing
  const saveImagesDebounced = useCallback(
    (images: string[], imageIds: Id<"_storage">[]) => {
      // Clear existing timeout
      if (imageSaveTimeoutRef.current) {
        clearTimeout(imageSaveTimeoutRef.current);
      }

      // Save after 50ms to batch rapid image operations
      imageSaveTimeoutRef.current = setTimeout(() => {
        try {
          if (images.length > 0) {
            localStorage.setItem(
              STORAGE_KEYS.UPLOADED_IMAGES,
              JSON.stringify(images),
            );
            localStorage.setItem(
              STORAGE_KEYS.UPLOADED_IMAGE_IDS,
              JSON.stringify(imageIds),
            );
          } else {
            localStorage.removeItem(STORAGE_KEYS.UPLOADED_IMAGES);
            localStorage.removeItem(STORAGE_KEYS.UPLOADED_IMAGE_IDS);
          }
        } catch (error) {
          console.error("Error saving images:", error);
        }
      }, 50);
    },
    [],
  );

  // Add image with debounced localStorage save
  const addImages = useCallback(
    (newImages: string[], newImageIds: Id<"_storage">[]) => {
      setUploadedImages((prev) => {
        const updatedImages = [...prev, ...newImages];
        const updatedImageIds = [...uploadedImageIds, ...newImageIds];
        // Save both arrays together with debouncing
        saveImagesDebounced(updatedImages, updatedImageIds);

        // Batch both state updates to prevent multiple renders
        setUploadedImageIds(updatedImageIds);

        return updatedImages;
      });
    },
    [saveImagesDebounced, uploadedImageIds],
  );

  // Remove image with debounced localStorage update
  const removeImage = useCallback(
    (index: number) => {
      setUploadedImages((prev) => {
        const updatedImages = prev.filter((_, i) => i !== index);
        const updatedImageIds = uploadedImageIds.filter((_, i) => i !== index);
        // Save both arrays together with debouncing
        saveImagesDebounced(updatedImages, updatedImageIds);

        // Batch both state updates to prevent multiple renders
        setUploadedImageIds(updatedImageIds);

        return updatedImages;
      });
    },
    [saveImagesDebounced, uploadedImageIds],
  );

  // Update theme with debounced localStorage save
  const updateSelectedTheme = useCallback((theme: string) => {
    const normalizedTheme = normalizeStoredTheme(theme);
    setSelectedTheme(normalizedTheme);

    // Clear existing timeout
    if (themeSaveTimeoutRef.current) {
      clearTimeout(themeSaveTimeoutRef.current);
    }

    // Save after 100ms (themes change less frequently than text)
    themeSaveTimeoutRef.current = setTimeout(() => {
      try {
        if (normalizedTheme.trim()) {
          localStorage.setItem(STORAGE_KEYS.SELECTED_THEME, normalizedTheme);
        } else {
          localStorage.removeItem(STORAGE_KEYS.SELECTED_THEME);
        }
      } catch (error) {
        console.error("Error saving theme:", error);
      }
    }, 100);
  }, []);

  // Clear all storage (called after successful project creation)
  const clearAllStorage = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS.USER_INPUT);
      localStorage.removeItem(STORAGE_KEYS.UPLOADED_IMAGES);
      localStorage.removeItem(STORAGE_KEYS.UPLOADED_IMAGE_IDS);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_THEME);

      // Clear state
      setUserInput("");
      setUploadedImages([]);
      setUploadedImageIds([]);
      setSelectedTheme("");

      // Clear any pending saves
      if (textSaveTimeoutRef.current) {
        clearTimeout(textSaveTimeoutRef.current);
      }
      if (themeSaveTimeoutRef.current) {
        clearTimeout(themeSaveTimeoutRef.current);
      }
      if (imageSaveTimeoutRef.current) {
        clearTimeout(imageSaveTimeoutRef.current);
      }
    } catch (error) {
      console.error("Error clearing storage:", error);
    }
  }, []);

  // Save current state immediately (useful for pre-login saves)
  const saveCurrentState = useCallback(() => {
    try {
      const normalizedTheme = normalizeStoredTheme(selectedTheme);

      if (userInput.trim()) {
        localStorage.setItem(STORAGE_KEYS.USER_INPUT, userInput);
      }
      if (uploadedImages.length > 0) {
        localStorage.setItem(
          STORAGE_KEYS.UPLOADED_IMAGES,
          JSON.stringify(uploadedImages),
        );
      }
      if (uploadedImageIds.length > 0) {
        localStorage.setItem(
          STORAGE_KEYS.UPLOADED_IMAGE_IDS,
          JSON.stringify(uploadedImageIds),
        );
      }
      if (normalizedTheme.trim()) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_THEME, normalizedTheme);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_THEME);
      }
    } catch (error) {
      console.error("Error saving current state:", error);
    }
  }, [userInput, uploadedImages, uploadedImageIds, selectedTheme]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (textSaveTimeoutRef.current) {
        clearTimeout(textSaveTimeoutRef.current);
      }
      if (themeSaveTimeoutRef.current) {
        clearTimeout(themeSaveTimeoutRef.current);
      }
      if (imageSaveTimeoutRef.current) {
        clearTimeout(imageSaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    userInput,
    uploadedImages,
    uploadedImageIds,
    selectedTheme,
    isHydrated,

    // Actions
    updateUserInput,
    addImages,
    removeImage,
    updateSelectedTheme,
    clearAllStorage,
    saveCurrentState,
  };
};
