"use client";

import { useSignedInUser } from "@/vly/hooks/use-user";
import { SignedOut, SignInButton } from "@/vly/components/auth/AuthComponents";
import { useMutation } from "convex/react";
import { Loader, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useRateLimit } from "@convex-dev/rate-limiter/react";
import { useQuery } from "convex/react";
import { themePrompts } from "@/vly/lib/theme-prompts";
import { themeMetadata } from "@/vly/lib/theme-metadata";
import { preloadFont } from "@/vly/lib/googleFonts";
import ThemeConfirmationModal from "../ThemeConfirmationModal";
import { HeroGlassmorphism } from "./HeroGlassmorphism";
import { useSharedHeroStorage } from "@/vly/hooks/useSharedHeroStorage";
import { StatsPill } from "./StatsPill";
import { InputArea } from "./InputArea";
import Image from "next/image";
import { checkRateLimitAndNotify } from "@/vly/lib/rateLimitHelpers";
import { handleProjectCreationResult } from "@/vly/lib/project-creation-handler";

// Preload critical icons
const ICONS = {
  sparkle: "/codicon_sparkle-filled.svg",
  photo: "/material-symbols_photo-rounded.svg",
} as const;

// Preload icons immediately when module loads
if (typeof window !== "undefined") {
  Object.values(ICONS).forEach((src) => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.href = src;
    link.as = "image";
    document.head.appendChild(link);
  });
}

interface HeroClientProps {
  isThemePickerOpen: boolean;
  setIsThemePickerOpen: (open: boolean) => void;
}

export function HeroClient({ setIsThemePickerOpen }: HeroClientProps) {
  const [isInput, setIsInput] = useState(false);
  void setIsInput; // Currently unused but kept for future use
  const [isLoading, setIsLoading] = useState(false);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [isThemeConfirmationOpen, setIsThemeConfirmationOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use shared storage hook
  const {
    userInput,
    uploadedImages,
    uploadedImageIds,
    selectedTheme,
    isHydrated,
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

  // Fetch real stats
  const userCount = useQuery(api.users.getUserCount);
  const projectCount = useQuery(api.project.getProjectCount);

  // Load theme font when selected theme changes
  useEffect(() => {
    if (selectedTheme && themeMetadata[selectedTheme]?.font) {
      preloadFont(themeMetadata[selectedTheme].font);
    }
  }, [selectedTheme]);

  // Optimized effect that handles both focus and height calculation
  useEffect(() => {
    if (!inputRef.current) return;

    // Handle focus when needed
    if (isInput) {
      inputRef.current.focus();
    }

    // Batch DOM operations for height calculation
    const textarea = inputRef.current;
    textarea.style.height = "auto";
    const newHeight = textarea.scrollHeight;
    textarea.style.height = `${newHeight}px`;

    // Check if text is more than 2 lines (using more accurate calculation)
    const lineHeight = 24;
    const isMultiLineNow = newHeight > lineHeight * 2;

    // Only update state if it actually changed (functional update prevents unnecessary renders)
    setIsMultiLine((prev) => {
      if (prev !== isMultiLineNow) {
        return isMultiLineNow;
      }
      return prev;
    });
  }, [isInput, userInput]);

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        // Process files in parallel instead of sequentially
        const fileProcessingPromises = Array.from(files).map(async (file) => {
          if (!file.type.startsWith("image/")) {
            toast.error("Please select only image files");
            return;
          }

          try {
            // Generate upload URL and read file in parallel
            const [postUrl, dataUrl] = await Promise.all([
              generateUploadUrl(),
              new Promise<string>((resolve, reject) => {
                const fileReader = new FileReader();
                fileReader.onload = (e) => resolve(e.target?.result as string);
                fileReader.onerror = reject;
                fileReader.readAsDataURL(file);
              }),
            ]);

            // Upload file to Convex storage
            const result = await fetch(postUrl, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });

            const { storageId } = await result.json();

            // Add to images immediately with both preview and storage ID
            addImages([dataUrl], [storageId]);
          } catch (error) {
            console.error("Error uploading image:", error);
            toast.error("Failed to upload image. Please try again.");
          }
        });

        // Process all files in parallel without blocking
        Promise.all(fileProcessingPromises);
      }
      // Reset the file input so the same file can be selected again
      event.target.value = "";
    },
    [generateUploadUrl, addImages],
  );

  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  // Storage is handled by automatic localStorage sync

  // Create project with current state
  const createProjectWithCurrentState = useCallback(
    async (themeToUse?: string) => {
      if (!userInput.trim() || !user) return;

      // Check if we're rate limited (use hook's status for proactive check)
      if (!checkRateLimitAndNotify(retryAt, "creating a project")) {
        return;
      }

      setIsLoading(true);
      try {
        // Use provided theme or fall back to selectedTheme from state
        const effectiveTheme = themeToUse || selectedTheme;

        // Check if there's a selected theme and customize the prompt
        let finalPrompt = userInput;

        console.log("Debug: Creating project with theme:", effectiveTheme);
        if (
          effectiveTheme &&
          effectiveTheme !== "none" &&
          themePrompts[effectiveTheme as keyof typeof themePrompts]
        ) {
          const themePrompt =
            themePrompts[effectiveTheme as keyof typeof themePrompts];
          finalPrompt = `${userInput}

Please style this project with a ${effectiveTheme} theme. Apply the following design guidelines: ${themePrompt}`;
          console.log("Debug: Enhanced prompt with theme:", finalPrompt);
        } else {
          console.log(
            "Debug: No theme applied. effectiveTheme:",
            effectiveTheme,
            "exists in prompts:",
            !!themePrompts[effectiveTheme as keyof typeof themePrompts],
          );
        }

        // Create the project with the theme-enhanced prompt
        console.time("createProject");
        const result = await createProject({
          initialDocumentContent: finalPrompt,
          displayMessage: userInput,
          agentMode: "POWERFUL",
          ...(uploadedImageIds.length > 0 ? { images: uploadedImageIds } : {}),
        });
        console.timeEnd("createProject");

        // Handle result (errors, rate limits, paused deployments, etc.)
        const success = handleProjectCreationResult(result, router, () => {
          // Success callback - show theme toast and clear storage
          if (effectiveTheme && effectiveTheme !== "none") {
            toast.success(`Project created with ${effectiveTheme} theme!`);
          }
          clearAllStorage();
        });

        // If failed, stop loading
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
      user,
      uploadedImageIds,
      createProject,
      router,
      clearAllStorage,
      retryAt,
    ],
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

        // Process pasted images in parallel instead of sequentially
        const imageProcessingPromises = imageFiles.map(async (file) => {
          try {
            // Generate upload URL and read file in parallel
            const [postUrl, dataUrl] = await Promise.all([
              generateUploadUrl(),
              new Promise<string>((resolve, reject) => {
                const fileReader = new FileReader();
                fileReader.onload = (e) => resolve(e.target?.result as string);
                fileReader.onerror = reject;
                fileReader.readAsDataURL(file);
              }),
            ]);

            // Upload file to Convex storage
            const result = await fetch(postUrl, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });

            const { storageId } = await result.json();

            // Add to images immediately with both preview and storage ID
            addImages([dataUrl], [storageId]);
          } catch (error) {
            console.error("Error uploading pasted image:", error);
            toast.error("Failed to upload pasted image. Please try again.");
          }
        });

        // Process all pasted images in parallel without blocking
        Promise.all(imageProcessingPromises);
      }
    },
    [generateUploadUrl, addImages],
  );

  const handleStartProject = useCallback(async () => {
    if (!userInput.trim()) return;

    // Check if user has selected a theme or explicitly skipped
    if (!selectedTheme) {
      // Show theme confirmation modal first
      setIsThemeConfirmationOpen(true);
      return;
    }

    if (!user) {
      // State is already saved automatically by the hook
      document.getElementById("hero-signin-btn")?.click();
      return;
    }

    // User is signed in and has theme (or skipped), proceed with creation
    await createProjectWithCurrentState();
  }, [userInput, user, selectedTheme, createProjectWithCurrentState]);

  // Separate function to proceed after theme selection or skip
  const proceedToCreateOrSignIn = useCallback(
    (themeToUse?: string) => {
      if (!user) {
        document.getElementById("hero-signin-btn")?.click();
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
      // Shift+Enter allows new line (default textarea behavior)
    },
    [handleStartProject],
  );

  // Handle theme confirmation modal
  const handleThemeSelect = useCallback(
    (theme: string) => {
      console.log("Debug: Theme selected from confirmation modal:", theme);
      updateSelectedTheme(theme);
      setIsThemeConfirmationOpen(false);

      // Continue with project creation flow, passing the theme directly
      proceedToCreateOrSignIn(theme);
    },
    [proceedToCreateOrSignIn, updateSelectedTheme],
  );

  const handleSkipTheme = useCallback(() => {
    // Set a marker to indicate user has made a choice (skip theme)
    updateSelectedTheme("none");
    setIsThemeConfirmationOpen(false);

    // Continue without theme
    proceedToCreateOrSignIn("none");
  }, [proceedToCreateOrSignIn, updateSelectedTheme]);

  // Use consistent input area height to prevent layout shifts
  const inputAreaHeight = "h-[42vh]";

  // Tooltip state
  const [hoverUpload, setHoverUpload] = useState(false);
  const [hoverTheme, setHoverTheme] = useState(false);
  const [hoverStart, setHoverStart] = useState(false);

  return (
    <>
      <HeroGlassmorphism>
        {/* Input field with animated placeholder */}
        <div
          className={`relative z-10 mx-[8vw] flex min-h-[15vh] w-auto min-w-[120px] flex-col items-start justify-start pt-4 sm:mx-[12vw] sm:min-h-[20vh] sm:pt-8 md:mx-[95px] ${inputAreaHeight} prevent-layout-shift`}
          onClick={() => inputRef.current?.focus()}
          style={{ cursor: "text" }}
        >
          <InputArea
            userInput={userInput}
            updateUserInput={updateUserInput}
            handleKeyDown={handleKeyDown}
            handlePaste={handlePaste}
            isLoading={isLoading}
            uploadedImages={uploadedImages}
            removeImage={removeImage}
            inputRef={inputRef}
            isMultiLine={isMultiLine}
            selectedTheme={selectedTheme}
            updateSelectedTheme={updateSelectedTheme}
            isHydrated={isHydrated}
          />
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
            <button id="hero-signin-btn" style={{ display: "none" }} />
          </SignInButton>
        </SignedOut>

        {/* Action buttons */}
        <div className="animate-fadeInSlideLeft absolute right-[60px] top-[20vh] hidden flex-col gap-2 pt-4 md:flex">
          <button
            type="button"
            className={`relative h-10 w-10 p-0 transition-transform hover:scale-110 active:scale-95 ${selectedTheme ? "rounded-full ring-2 ring-[#7CFF3F] ring-offset-2" : ""}`}
            onClick={() => setIsThemePickerOpen(true)}
            onMouseEnter={() => setHoverTheme(true)}
            onMouseLeave={() => setHoverTheme(false)}
          >
            <Image
              src={ICONS.sparkle}
              alt="Sparkle"
              width={40}
              height={40}
              priority
              sizes="40px"
              className="h-full w-full"
              style={{ objectFit: "contain" }}
            />
            {selectedTheme && (
              <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#7CFF3F]"></div>
            )}
            {hoverTheme && (
              <div
                className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white shadow"
                style={{ pointerEvents: "none" }}
              >
                Add Theme
              </div>
            )}
          </button>
          <button
            type="button"
            className="relative h-10 w-10 p-0 transition-transform hover:scale-110 active:scale-95"
            onClick={triggerImageUpload}
            onMouseEnter={() => setHoverUpload(true)}
            onMouseLeave={() => setHoverUpload(false)}
          >
            <Image
              src={ICONS.photo}
              alt="Photo"
              width={40}
              height={40}
              priority
              sizes="40px"
              className="h-full w-full"
              style={{ objectFit: "contain" }}
            />
            {hoverUpload && (
              <div
                className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white shadow"
                style={{ pointerEvents: "none" }}
              >
                Upload Image
              </div>
            )}
          </button>
          <div
            className="relative"
            onMouseEnter={() => setHoverStart(true)}
            onMouseLeave={() => setHoverStart(false)}
          >
            <button
              type="button"
              className="relative flex hidden h-10 w-10 items-center justify-center rounded-full bg-[#7CFF3F] p-0 text-white transition-transform hover:scale-110 active:scale-95 md:flex"
              onClick={handleStartProject}
              disabled={isLoading || !userInput.trim()}
              style={{
                opacity: 1,
                cursor:
                  isLoading || !userInput.trim() ? "not-allowed" : "pointer",
              }}
            >
              {isLoading ? (
                <Loader className="mx-auto h-10 w-10 animate-spin text-white" />
              ) : (
                <ArrowUp className="h-7 w-7 text-white" strokeWidth={2.5} />
              )}
              {hoverStart && (
                <div
                  className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white shadow"
                  style={{ pointerEvents: "none" }}
                >
                  {isLoading || !userInput.trim()
                    ? "Start typing to submit"
                    : "(Enter to submit, Shift+Enter for new line)"}
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Action buttons - Horizontal above headline */}
        <div className="animate-fadeInSlideUp relative z-10 mb-4 ml-auto flex max-w-fit gap-2 py-2 pr-[12vw] md:hidden">
          <button
            type="button"
            className={`relative h-10 w-10 p-0 transition-transform hover:scale-110 active:scale-95 ${selectedTheme ? "rounded-full ring-2 ring-[#7CFF3F] ring-offset-2" : ""}`}
            onClick={() => setIsThemePickerOpen(true)}
          >
            <Image
              src={ICONS.sparkle}
              alt="Sparkle"
              width={40}
              height={40}
              priority
              sizes="40px"
              className="h-10 w-10"
              style={{ objectFit: "contain" }}
            />
            {selectedTheme && (
              <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#7CFF3F]"></div>
            )}
          </button>
          <button
            type="button"
            className="relative h-10 w-10 p-0 transition-transform hover:scale-110 active:scale-95"
            onClick={triggerImageUpload}
          >
            <Image
              src={ICONS.photo}
              alt="Photo"
              width={40}
              height={40}
              priority
              sizes="40px"
              className="h-10 w-10"
              style={{ objectFit: "contain" }}
            />
          </button>
          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#7CFF3F] p-0 text-white transition-transform hover:scale-110 active:scale-95"
            onClick={handleStartProject}
            disabled={isLoading || !userInput.trim()}
            style={{
              opacity: 1,
              cursor:
                isLoading || !userInput.trim() ? "not-allowed" : "pointer",
            }}
          >
            {isLoading ? (
              <Loader className="mx-auto h-10 w-10 animate-spin text-white" />
            ) : (
              <ArrowUp className="h-7 w-7 text-white" strokeWidth={2.5} />
            )}
          </button>
        </div>
      </HeroGlassmorphism>

      {/* Stats badges */}
      <StatsPill value={projectCount} label="Powering" position="left" />
      <StatsPill value={userCount} label="Join" position="right" />

      {/* Theme Confirmation Modal */}
      <ThemeConfirmationModal
        isOpen={isThemeConfirmationOpen}
        onClose={() => setIsThemeConfirmationOpen(false)}
        onSelectTheme={handleThemeSelect}
        onSkip={handleSkipTheme}
      />
    </>
  );
}
