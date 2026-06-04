"use client";

import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import Image from "next/image";
import { ThemeBadge } from "../ui/ThemeBadge";
import { Loader, ArrowRight, Palette, ImagePlus } from "lucide-react";
// Suggestions can be added if needed in the future
// import { allSuggestions, getRandomSuggestions, getDefaultSuggestions } from "../landing-4/suggestions";
import { useSharedHeroStorage } from "@/vly/hooks/useSharedHeroStorage";
import { useSignedInUser } from "@/vly/hooks/use-user";
import { SignedOut, SignInButton } from "@/vly/components/auth/AuthComponents";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useRateLimit } from "@convex-dev/rate-limiter/react";
import { themePrompts } from "@/vly/lib/theme-prompts";
import { themeMetadata } from "@/vly/lib/theme-metadata";
import { preloadFont } from "@/vly/lib/googleFonts";
import ThemeConfirmationModal from "../ThemeConfirmationModal";
import { checkRateLimitAndNotify } from "@/vly/lib/rateLimitHelpers";
import { handleProjectCreationResult } from "@/vly/lib/project-creation-handler";

// Typing animation for placeholder
const TypingAnimation = memo(() => {
  const suggestions = [
    "build a realtime collaboration app...",
    "create an e-commerce marketplace...",
    "make a social media dashboard...",
  ];
  const [displayed, setDisplayed] = useState("");
  const [mounted, setMounted] = useState(false);
  const currentIndexRef = useRef(0);
  const animationRef = useRef<{ timeout?: NodeJS.Timeout; shouldRun: boolean }>(
    {
      shouldRun: false,
    },
  );

  useEffect(() => {
    setMounted(true);
    animationRef.current.shouldRun = true;

    const runAnimation = () => {
      if (!animationRef.current.shouldRun) return;

      const currentSuggestion = suggestions[currentIndexRef.current];
      let currentText = "";
      let charIndex = 0;

      const typeNextChar = () => {
        if (!animationRef.current.shouldRun) return;

        if (charIndex < currentSuggestion.length) {
          currentText = currentSuggestion.slice(0, charIndex + 1);
          setDisplayed(currentText);
          charIndex++;
          animationRef.current.timeout = setTimeout(typeNextChar, 50);
        } else {
          animationRef.current.timeout = setTimeout(() => {
            if (!animationRef.current.shouldRun) return;
            currentIndexRef.current =
              (currentIndexRef.current + 1) % suggestions.length;
            setDisplayed("");
            animationRef.current.timeout = setTimeout(runAnimation, 100);
          }, 2000);
        }
      };

      animationRef.current.timeout = setTimeout(typeNextChar, 300);
    };

    runAnimation();

    // Capture ref value before cleanup to avoid stale ref issue
    const animation = animationRef.current;
    return () => {
      animation.shouldRun = false;
      if (animation.timeout) {
        clearTimeout(animation.timeout);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted)
    return <span className="opacity-50">Start typing your idea...</span>;

  return (
    <span className="opacity-50">
      {displayed || "Start typing your idea..."}
    </span>
  );
});

TypingAnimation.displayName = "TypingAnimation";

interface DocumentInputProps {
  setIsThemePickerOpen: (open: boolean) => void;
  onProjectLimit?: () => void;
  onSuccess?: () => void;
}

export const DocumentInput: React.FC<DocumentInputProps> = ({
  setIsThemePickerOpen,
  onProjectLimit,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isThemeConfirmationOpen, setIsThemeConfirmationOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use shared storage hook
  const {
    userInput,
    uploadedImages,
    uploadedImageIds,
    selectedTheme,
    updateUserInput,
    addImages,
    removeImage,
    updateSelectedTheme,
    clearAllStorage,
  } = useSharedHeroStorage();

  // Project creation
  const user = useSignedInUser();
  const router = useRouter();
  const createProject = useMutation(api.codesandbox.create.create);

  // Check rate limit status proactively
  const { status } = useRateLimit(api.coding_agent.rateLimiter.getRateLimit, {
    getServerTimeMutation: api.coding_agent.rateLimiter.getServerTime,
  });
  const retryAt = status?.retryAt;
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);

  // Load theme font when selected theme changes
  useEffect(() => {
    if (selectedTheme && themeMetadata[selectedTheme]?.font) {
      preloadFont(themeMetadata[selectedTheme].font);
    }
  }, [selectedTheme]);

  // Handle textarea auto-resize
  useEffect(() => {
    if (!inputRef.current) return;

    const textarea = inputRef.current;
    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight, 300);
    textarea.style.height = `${newHeight}px`;
  }, [userInput]);

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        const fileProcessingPromises = Array.from(files).map(async (file) => {
          if (!file.type.startsWith("image/")) {
            toast.error("Please select only image files");
            return;
          }

          try {
            const [postUrl, dataUrl] = await Promise.all([
              generateUploadUrl(),
              new Promise<string>((resolve, reject) => {
                const fileReader = new FileReader();
                fileReader.onload = (e) => resolve(e.target?.result as string);
                fileReader.onerror = reject;
                fileReader.readAsDataURL(file);
              }),
            ]);

            const result = await fetch(postUrl, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });

            const { storageId } = await result.json();
            addImages([dataUrl], [storageId]);
          } catch (error) {
            console.error("Error uploading image:", error);
            toast.error("Failed to upload image. Please try again.");
          }
        });

        Promise.all(fileProcessingPromises);
      }
      event.target.value = "";
    },
    [generateUploadUrl, addImages],
  );

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Actual project creation logic (called after moderation passes)
  const executeProjectCreation = useCallback(
    async (themeToUse?: string) => {
      setIsLoading(true);
      try {
        const effectiveTheme = themeToUse || selectedTheme;
        let finalPrompt = userInput;

        if (
          effectiveTheme &&
          effectiveTheme !== "none" &&
          themePrompts[effectiveTheme as keyof typeof themePrompts]
        ) {
          const themePrompt =
            themePrompts[effectiveTheme as keyof typeof themePrompts];
          finalPrompt = `${userInput}\n\nPlease style this project with a ${effectiveTheme} theme. Apply the following design guidelines: ${themePrompt}`;
        }

        const result = await createProject({
          initialDocumentContent: finalPrompt,
          displayMessage: userInput,
          agentMode: "POWERFUL",
          ...(uploadedImageIds.length > 0 ? { images: uploadedImageIds } : {}),
        });

        const success = handleProjectCreationResult(
          result,
          router,
          () => {
            if (effectiveTheme && effectiveTheme !== "none") {
              toast.success(`Project created with ${effectiveTheme} theme!`);
            }
            clearAllStorage();
            onSuccess?.();
          },
          onProjectLimit,
        );

        if (!success) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error creating project:", error);
        toast.error(
          "Failed to create project. Please try again in a few minutes.",
        );
        setIsLoading(false);
      }
    },
    [
      userInput,
      selectedTheme,
      uploadedImageIds,
      createProject,
      router,
      clearAllStorage,
      onProjectLimit,
      onSuccess,
    ],
  );

  const createProjectWithCurrentState = useCallback(
    async (themeToUse?: string) => {
      if (!userInput.trim() || !user) return;

      if (!checkRateLimitAndNotify(retryAt, "creating a project")) {
        return;
      }

      await executeProjectCreation(themeToUse);
    },
    [userInput, user, retryAt, executeProjectCreation],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();

        const imageProcessingPromises = imageFiles.map(async (file) => {
          try {
            const [postUrl, dataUrl] = await Promise.all([
              generateUploadUrl(),
              new Promise<string>((resolve, reject) => {
                const fileReader = new FileReader();
                fileReader.onload = (e) => resolve(e.target?.result as string);
                fileReader.onerror = reject;
                fileReader.readAsDataURL(file);
              }),
            ]);

            const result = await fetch(postUrl, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });

            const { storageId } = await result.json();
            addImages([dataUrl], [storageId]);
          } catch (error) {
            console.error("Error uploading pasted image:", error);
            toast.error("Failed to upload pasted image. Please try again.");
          }
        });

        Promise.all(imageProcessingPromises);
      }
    },
    [generateUploadUrl, addImages],
  );

  const handleStartProject = useCallback(async () => {
    if (!userInput.trim()) return;

    if (!selectedTheme) {
      setIsThemeConfirmationOpen(true);
      return;
    }

    if (!user) {
      document.getElementById("doc-signin-btn")?.click();
      return;
    }

    await createProjectWithCurrentState();
  }, [userInput, user, selectedTheme, createProjectWithCurrentState]);

  const proceedToCreateOrSignIn = useCallback(
    (themeToUse?: string) => {
      if (!user) {
        document.getElementById("doc-signin-btn")?.click();
      } else {
        createProjectWithCurrentState(themeToUse);
      }
    },
    [user, createProjectWithCurrentState],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleStartProject();
      }
    },
    [handleStartProject],
  );

  const handleThemeSelect = useCallback(
    (theme: string) => {
      updateSelectedTheme(theme);
      setIsThemeConfirmationOpen(false);
      proceedToCreateOrSignIn(theme);
    },
    [proceedToCreateOrSignIn, updateSelectedTheme],
  );

  const handleSkipTheme = useCallback(() => {
    updateSelectedTheme("none");
    setIsThemeConfirmationOpen(false);
    proceedToCreateOrSignIn("none");
  }, [proceedToCreateOrSignIn, updateSelectedTheme]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateUserInput(e.target.value);
    },
    [updateUserInput],
  );

  const removeTheme = useCallback(() => {
    updateSelectedTheme("");
  }, [updateSelectedTheme]);

  return (
    <>
      {/* Google Docs Style Document Container */}
      <div className="animate-fade-in relative mx-auto w-full max-w-[816px]">
        {/* Document Paper */}
        <div
          className="relative overflow-hidden rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.24)]"
          style={{
            fontFamily: "'Roboto', 'Arial', sans-serif",
          }}
        >
          {/* Document Header - Ruler Style */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-[#F9FBFD] px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#4285F4]" />
              <span className="text-xs font-medium text-gray-500">
                Type your idea → full-stack web app
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400">
              <span>Freebuff Web</span>
            </div>
          </div>

          {/* Document Body */}
          <div
            className="relative min-h-[280px] cursor-text px-12 py-8"
            onClick={() => inputRef.current?.focus()}
          >
            {/* Uploaded images and theme badge */}
            {(selectedTheme || uploadedImages.length > 0) && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {selectedTheme && (
                  <ThemeBadge theme={selectedTheme} onRemove={removeTheme} />
                )}
                {uploadedImages.map((image, index) => (
                  <div
                    key={index}
                    className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200"
                  >
                    <Image
                      src={image}
                      alt={`Uploaded ${index + 1}`}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(index);
                      }}
                      className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow-sm hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea with placeholder */}
            <div className="relative">
              {userInput === "" && (
                <div className="pointer-events-none absolute inset-0 text-left text-lg leading-7 text-gray-400">
                  <TypingAnimation />
                </div>
              )}
              <textarea
                ref={inputRef}
                value={userInput}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder=""
                className="w-full resize-none border-none bg-transparent text-left text-lg leading-7 text-gray-800 outline-none placeholder:text-gray-400"
                style={{
                  minHeight: "140px",
                  fontFamily: "'Roboto', 'Arial', sans-serif",
                }}
                disabled={isLoading}
              />
            </div>

            {/* Suggestion chips - only show when input is empty */}
            {userInput === "" && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {[
                  "Multiplayer Gamified Learning",
                  "Custom Slack Application",
                  "Online shop with live chat",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateUserInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 transition-all hover:border-[#1a73e8] hover:bg-blue-50 hover:text-[#1a73e8]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Document Footer - Bottom Toolbar */}
          <div className="border-t border-gray-200 bg-[#F9FBFD] px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Left side - Action buttons */}
              <div className="flex items-center gap-2">
                {/* Theme Button */}
                <button
                  type="button"
                  onClick={() => setIsThemePickerOpen(true)}
                  className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-primary/70 hover:bg-primary/10 ${
                    selectedTheme
                      ? "border-primary/70 bg-primary/10 text-primary"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  <Palette className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {selectedTheme ? "Theme applied" : "Add theme"}
                  </span>
                </button>

                {/* Upload Image Button */}
                <button
                  type="button"
                  onClick={triggerImageUpload}
                  className="group flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-600 transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add image</span>
                </button>
              </div>

              {/* Right side - Submit button */}
              <button
                type="button"
                onClick={handleStartProject}
                disabled={isLoading || !userInput.trim()}
                className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  isLoading || !userInput.trim()
                    ? "cursor-not-allowed border border-gray-500 bg-gray-200 text-gray-700"
                    : "bg-[#1a73e8] text-white hover:bg-[#1557b0]"
                }`}
              >
                {isLoading ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Create</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            {/* Hint text */}
            <p className="mt-2 text-center text-xs text-gray-400">
              Press{" "}
              <kbd className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px]">
                Enter
              </kbd>{" "}
              to submit •{" "}
              <kbd className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px]">
                Shift+Enter
              </kbd>{" "}
              for new line
            </p>
          </div>
        </div>

      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Hidden sign-in button for modal trigger */}
      <SignedOut>
        <SignInButton mode="modal" asChild>
          <button id="doc-signin-btn" style={{ display: "none" }} />
        </SignInButton>
      </SignedOut>

      {/* Theme Confirmation Modal */}
      <ThemeConfirmationModal
        isOpen={isThemeConfirmationOpen}
        onClose={() => setIsThemeConfirmationOpen(false)}
        onSelectTheme={handleThemeSelect}
        onSkip={handleSkipTheme}
      />
    </>
  );
};

export default DocumentInput;
