"use client";

import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import Image from "next/image";
import { ThemeBadge } from "../ui/ThemeBadge";
import { Loader, ArrowUp, Palette, ImagePlus } from "lucide-react";
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

// Practical starter prompts shown as chips below the composer.
const PROJECT_SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "Waitlist landing page",
    prompt:
      "A waitlist landing page for a new product with a bold hero, feature highlights, and an email signup form.",
  },
  {
    label: "Support ticket system",
    prompt:
      "A support ticket system where customers can submit tickets and an agent dashboard can triage and reply to them.",
  },
  {
    label: "Blog",
    prompt:
      "A blog with a clean editorial theme, a post list, individual post pages, and tags.",
  },
  {
    label: "Booking app",
    prompt:
      "A booking app for a small studio where clients can pick a service, choose a time slot, and confirm an appointment.",
  },
];

// Typing animation for placeholder
const TypingAnimation = memo(() => {
  const suggestions = [
    "a waitlist landing page for a new product...",
    "a support ticket system for my team...",
    "a blog with a clean editorial theme...",
    "a booking app for a small studio...",
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

  if (!mounted) return <span>Ask Freebuff to create…</span>;

  return <span>{displayed || "Ask Freebuff to create…"}</span>;
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
      <div className="animate-fade-in relative mx-auto w-full max-w-[816px]">
        {/* Lovable-style input box */}
        <div
          className="relative cursor-text rounded-2xl bg-card/80 shadow-xl shadow-black/20 ring-1 ring-border/40 backdrop-blur transition-colors focus-within:ring-primary/45"
          onClick={() => inputRef.current?.focus()}
        >
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            {/* Uploaded images and theme badge */}
            {(selectedTheme || uploadedImages.length > 0) && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {selectedTheme && (
                  <ThemeBadge theme={selectedTheme} onRemove={removeTheme} />
                )}
                {uploadedImages.map((image, index) => (
                  <div
                    key={index}
                    className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-border/40"
                  >
                    <Image
                      src={image}
                      alt={`Uploaded ${index + 1}`}
                      fill
                      sizes="56px"
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
                <div className="pointer-events-none absolute inset-0 text-left text-base leading-7 text-muted-foreground">
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
                className="w-full resize-none border-none bg-transparent text-left text-base leading-7 text-foreground outline-none"
                style={{ minHeight: "76px" }}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
            <div className="flex items-center gap-1.5">
              {/* Upload Image Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerImageUpload();
                }}
                className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                title="Add image"
              >
                <ImagePlus className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">Image</span>
              </button>

              {/* Theme Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsThemePickerOpen(true);
                }}
                className={`flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors ${
                  selectedTheme
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
                title="Add theme"
              >
                <Palette className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">Theme</span>
              </button>
            </div>

            {/* Submit button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStartProject();
              }}
              disabled={isLoading || !userInput.trim()}
              aria-label="Create project"
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                isLoading || !userInput.trim()
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/85"
              }`}
            >
              {isLoading ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>

        {/* Suggestion chips - only show when input is empty */}
        {userInput === "" && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {PROJECT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => {
                  updateUserInput(suggestion.prompt);
                  inputRef.current?.focus();
                }}
                className="rounded-full border border-border/50 bg-card/40 px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
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
