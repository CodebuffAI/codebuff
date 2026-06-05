"use client";

import { useSignedInUser } from "@/vly/hooks/use-user";
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from "@/vly/components/auth/AuthComponents";
import { useMutation } from "convex/react";
import { Loader, ArrowUp, Palette } from "lucide-react";
import { useRouter } from "next/navigation";
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  memo,
} from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { LandingProjectList } from "./LandingProjectList";
import { useQuery } from "convex/react";
import { themePrompts } from "@/vly/lib/theme-prompts";
import { themeMetadata } from "@/vly/lib/theme-metadata";
import { preloadFont } from "@/vly/lib/googleFonts";
import ThemeConfirmationModal from "../ThemeConfirmationModal";
import { HeroBackground } from "./HeroBackground";
import { YCombinatorBadge } from "./YCombinatorBadge";
import { HeroHeadline } from "./HeroHeadline";
import { handleProjectCreationResult } from "@/vly/lib/project-creation-handler";
import { StatsPill } from "./StatsPill";
import { HeroGlassmorphism } from "./HeroGlassmorphism";
import { ThemeBadge } from "../ui/ThemeBadge";
import {
  allSuggestions,
  getRandomSuggestions,
  getDefaultSuggestions,
} from "./suggestions";
import { useSharedHeroStorage } from "@/vly/hooks/useSharedHeroStorage";

// Optimized typing animation component with reduced re-renders
const TypingAnimation = memo(() => {
  const suggestions = useMemo(
    () => [
      "make 3D multiplayer block game similar to Minecraft",
      "build a Slack-like realtime public messaging platform",
      "launch an ecommerce site for my business",
    ],
    [],
  );
  const [displayed, setDisplayed] = useState("");
  const [mounted, setMounted] = useState(false);

  // Use refs to avoid dependencies in effects
  const currentIndexRef = useRef(0);
  const animationRef = useRef<{ timeout?: NodeJS.Timeout; shouldRun: boolean }>(
    {
      shouldRun: false,
    },
  );

  // Single effect to handle mounting and animation
  useEffect(() => {
    setMounted(true);
    animationRef.current.shouldRun = true;

    // Copy ref to local variable for cleanup
    const animation = animationRef.current;

    const runAnimation = () => {
      if (!animation.shouldRun) return;

      const currentSuggestion = suggestions[currentIndexRef.current];
      let currentText = "";
      let charIndex = 0;

      const typeNextChar = () => {
        if (!animation.shouldRun) return;

        if (charIndex < currentSuggestion.length) {
          currentText = currentSuggestion.slice(0, charIndex + 1);
          setDisplayed(currentText);
          charIndex++;
          animation.timeout = setTimeout(typeNextChar, 60);
        } else {
          // Pause before next suggestion
          animation.timeout = setTimeout(() => {
            if (!animation.shouldRun) return;
            currentIndexRef.current =
              (currentIndexRef.current + 1) % suggestions.length;
            setDisplayed("");
            // Small delay before starting next word
            animation.timeout = setTimeout(runAnimation, 100);
          }, 1200);
        }
      };

      // Start typing after initial delay
      animation.timeout = setTimeout(typeNextChar, 500);
    };

    runAnimation();

    return () => {
      animation.shouldRun = false;
      if (animation.timeout) {
        clearTimeout(animation.timeout);
      }
    };
    // suggestions is stable (memoized with empty deps), adding it to satisfy linter
  }, [suggestions]);

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted) return "";

  return displayed;
});

TypingAnimation.displayName = "TypingAnimation";

// Simple memoized project list
const MemoizedLandingProjectList = memo(() => <LandingProjectList />);
MemoizedLandingProjectList.displayName = "MemoizedLandingProjectList";

// Memoized input area to prevent hero re-renders during typing
const InputArea = memo(
  ({
    userInput,
    updateUserInput,
    handleKeyDown,
    handlePaste,
    isLoading,
    uploadedImages,
    removeImage,
    inputRef,
    isMultiLine,
    selectedTheme,
    updateSelectedTheme,
    isHydrated,
  }: {
    userInput: string;
    updateUserInput: (value: string) => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
    isLoading: boolean;
    uploadedImages: string[];
    removeImage: (index: number) => void;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    isMultiLine: boolean;
    selectedTheme: string;
    updateSelectedTheme: (theme: string) => void;
    isHydrated: boolean;
  }) => {
    const [displayedSuggestions, setDisplayedSuggestions] = useState<
      typeof allSuggestions
    >(getDefaultSuggestions());
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionsVisible, setSuggestionsVisible] = useState(false);

    // Initialize and randomize suggestions after hydration
    useEffect(() => {
      // Randomize suggestions once hydrated to avoid seeing same ones every time
      if (isHydrated) {
        // Defer state update to avoid cascading renders
        setTimeout(() => setDisplayedSuggestions(getRandomSuggestions()), 0);
      }
    }, [isHydrated]);

    // Handle suggestions visibility with smooth transitions
    useEffect(() => {
      const shouldShow = userInput === "" && isHydrated;
      if (shouldShow) {
        // Show suggestions DOM first (async to avoid setState in effect)
        const showTimer = setTimeout(() => setShowSuggestions(true), 0);
        // Then fade in with a small delay to ensure smooth transition
        const fadeInTimer = setTimeout(() => setSuggestionsVisible(true), 10);
        return () => {
          clearTimeout(showTimer);
          clearTimeout(fadeInTimer);
        };
      } else {
        // Fade out first (async to avoid setState in effect)
        const fadeOutTimer = setTimeout(() => setSuggestionsVisible(false), 0);
        // Then hide DOM after animation completes
        const hideTimer = setTimeout(() => setShowSuggestions(false), 300);
        return () => {
          clearTimeout(fadeOutTimer);
          clearTimeout(hideTimer);
        };
      }
    }, [userInput, isHydrated]);

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateUserInput(e.target.value);
      },
      [updateUserInput],
    );

    const setSuggestion = useCallback(
      (suggestion: string, event: React.MouseEvent<HTMLDivElement>) => {
        const suggestionElement = event.currentTarget;

        // Create ripple effect at click position
        const rect = suggestionElement.getBoundingClientRect();
        const ripple = document.createElement("div");
        const size = 50;
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
        ripple.classList.add("suggestion-ripple");
        suggestionElement.appendChild(ripple);

        // Add flourish class to the suggestion box
        suggestionElement.classList.add("suggestion-flourish");

        // Update input with animation
        const inputElement = inputRef.current;
        if (inputElement) {
          inputElement.classList.add("text-populate");
        }

        // Set the suggestion text
        updateUserInput(suggestion);

        // Cleanup animations
        setTimeout(() => {
          if (ripple.parentNode) {
            ripple.remove();
          }
          if (suggestionElement) {
            suggestionElement.classList.remove("suggestion-flourish");
          }
          if (inputElement) {
            inputElement.classList.remove("text-populate");
          }
        }, 800);
      },
      [updateUserInput, inputRef],
    );

    const shuffleSuggestions = useCallback(() => {
      setDisplayedSuggestions(getRandomSuggestions());
    }, []);

    const removeTheme = useCallback(() => {
      updateSelectedTheme("");
    }, [updateSelectedTheme]);

    return (
      <>
        {/* Always reserve space for pills to prevent layout shifts */}
        <div className="relative z-50 mb-2 min-h-[50px] w-full pt-3 sm:mb-4 sm:min-h-[60px] sm:pt-2">
          <div
            className={`flex min-h-[40px] w-full items-center justify-start gap-2 overflow-x-visible pt-1 transition-opacity duration-300 sm:min-h-[60px] sm:pt-0 ${selectedTheme || uploadedImages.length > 0 ? "opacity-100" : "opacity-0"}`}
          >
            {selectedTheme && (
              <ThemeBadge theme={selectedTheme} onRemove={removeTheme} />
            )}
            {uploadedImages.map((image, index) => (
              <div
                key={index}
                className="relative h-10 flex-shrink-0 transition-opacity duration-300 animate-in fade-in-0 sm:h-12"
              >
                <img
                  src={image}
                  alt={`Uploaded ${index + 1}`}
                  className="h-10 w-auto rounded-lg object-contain sm:h-12"
                  loading="lazy"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(index);
                  }}
                  className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-[#7CFF3F] bg-white text-xs font-bold text-[#7CFF3F] transition-colors hover:bg-[#7CFF3F]/20 sm:-right-2 sm:-top-2 sm:h-6 sm:w-6"
                  title="Delete image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="relative w-full">
          {/* Floating arrow - positioned relative to text input */}
          {userInput === "" && (
            <div className="animate-fadeInSlideRight absolute -left-8 top-0 z-20 hidden items-center gap-2 md:flex">
              <div className="animate-arrowFloat -mt-0.5 text-lg text-[#7CFF3F]">
                →
              </div>
            </div>
          )}
          {userInput === "" && (
            <div className="pointer-events-none absolute left-0 top-0 w-full text-left font-sans font-normal text-gray-500 md:left-0">
              Start typing to start creating. Ask vly to <TypingAnimation />
            </div>
          )}
          <textarea
            ref={inputRef}
            value={userInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder=""
            className="caret-thick max-h-[24vh] w-full resize-none overflow-y-auto border-none bg-transparent text-left align-top font-sans font-normal text-[#2C2C2C] placeholder-gray-500 caret-[#AC697E] outline-none scrollbar-hide placeholder:text-left placeholder:font-sans placeholder:font-normal"
            style={{
              minWidth: 120,
              padding: 0,
              margin: 0,
              lineHeight: "1.5",
              verticalAlign: "top",
              caretColor: "#AC697E",
            }}
            disabled={isLoading}
            autoFocus={false}
          />
        </div>
        {/* Suggestions bar*/}
        {showSuggestions && (
          <div
            className={`${isMultiLine ? "mt-[5vh] sm:mt-[6vh]" : "mt-[4vh] sm:mt-[4vh]"} flex max-w-full flex-wrap items-center justify-start gap-2 transition-opacity duration-300 sm:gap-4 md:mt-[2vh] ${suggestionsVisible ? "opacity-100" : "opacity-0"}`}
          >
            {displayedSuggestions.map((suggestion, index) => (
              <div
                key={index}
                className="group relative flex flex-shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-[90px] border-2 border-dashed border-zinc-300 px-3 py-1.5 transition-all hover:border-[#7CFF3F] hover:bg-gray-100 sm:gap-2.5 sm:px-4 sm:py-2"
                onClick={(e) => setSuggestion(suggestion.prompt, e)}
              >
                <div className="relative h-5 w-5 overflow-hidden sm:h-6 sm:w-6">
                  <svg
                    className="absolute left-[4px] top-[4px] h-3 w-3 sm:left-[5px] sm:top-[5px] sm:h-3.5 sm:w-3.5"
                    viewBox="0 0 14 14"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <line
                      x1="7"
                      y1="2"
                      x2="7"
                      y2="12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="text-[#8A8A8A] transition-colors group-hover:text-[#7CFF3F]"
                    />
                    <line
                      x1="2"
                      y1="7"
                      x2="12"
                      y2="7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="text-[#8A8A8A] transition-colors group-hover:text-[#7CFF3F]"
                    />
                  </svg>
                </div>
                <div className="justify-center text-center font-['Geist'] text-xs font-normal leading-normal text-[#8A8A8A] transition-colors group-hover:text-[#7CFF3F] sm:text-sm">
                  {suggestion.label}
                </div>
              </div>
            ))}

            {/* Refresh button */}
            <div
              className="flex flex-shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[90px] border-2 border-solid border-zinc-300 px-3 py-1.5 transition-colors hover:bg-gray-100 sm:gap-2.5 sm:px-4 sm:py-2"
              onClick={shuffleSuggestions}
              title="Refresh suggestions"
            >
              <div className="relative h-6 w-6 overflow-hidden">
                <svg
                  className="absolute left-[4px] top-[4px] h-3 w-3 sm:left-[5px] sm:top-[5px] sm:h-3.5 sm:w-3.5"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M1 4V1H4"
                    stroke="#8A8A8A"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M13 10V13H10"
                    stroke="#8A8A8A"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12.5 5C11.9 3.1 10.1 2 8 2C6.6 2 5.4 2.7 4.6 3.7L1 4"
                    stroke="#8A8A8A"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M1.5 9C2.1 10.9 3.9 12 6 12C7.4 12 8.6 11.3 9.4 10.3L13 10"
                    stroke="#8A8A8A"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
);

InputArea.displayName = "InputArea";

interface HeroProps {
  isThemePickerOpen: boolean;
  setIsThemePickerOpen: (open: boolean) => void;
}

export default function Hero({ setIsThemePickerOpen }: HeroProps) {
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

  // Optimized height calculation with proper debouncing
  useEffect(() => {
    if (!inputRef.current) return;

    const textarea = inputRef.current;
    let rafId: number;

    // Use longer debounce for better performance
    const timeoutId = setTimeout(() => {
      rafId = requestAnimationFrame(() => {
        if (!textarea) return;

        // Store current values to minimize DOM queries
        const currentHeight = textarea.style.height;

        // Reset height to get accurate scrollHeight
        textarea.style.height = "auto";
        const newScrollHeight = textarea.scrollHeight;
        const newHeightPx = `${newScrollHeight}px`;

        // Only update if height actually changed
        if (currentHeight !== newHeightPx) {
          textarea.style.height = newHeightPx;
        }

        // Calculate multiline state more efficiently
        const lineHeight = 24;
        const isMultiLineNow = newScrollHeight > lineHeight * 2.5; // More forgiving threshold

        // Batch state update with functional update to avoid stale closures
        setIsMultiLine((prev) =>
          prev !== isMultiLineNow ? isMultiLineNow : prev,
        );
      });
    }, 100); // Increased debounce time for better performance

    return () => {
      clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [userInput]);

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) {
            alert("Please select only image files");
            continue;
          }

          try {
            // Generate upload URL
            const postUrl = await generateUploadUrl();

            // Upload file to Convex storage
            const result = await fetch(postUrl, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });

            const { storageId } = await result.json();

            // Create preview URL for display
            const fileReader = new FileReader();
            fileReader.onload = (e) => {
              addImages([e.target?.result as string], [storageId]);
            };
            fileReader.readAsDataURL(file);
          } catch (error) {
            console.error("Error uploading image:", error);
            alert("Failed to upload image. Please try again.");
          }
        }
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

      setIsLoading(true);
      try {
        // Use provided theme or fall back to selectedTheme from state
        const effectiveTheme = themeToUse || selectedTheme;

        // Check if there's a selected theme and customize the prompt
        let finalPrompt = userInput;

        if (
          effectiveTheme &&
          effectiveTheme !== "none" &&
          themePrompts[effectiveTheme as keyof typeof themePrompts]
        ) {
          const themePrompt =
            themePrompts[effectiveTheme as keyof typeof themePrompts];
          finalPrompt = `${userInput}

Please style this project with a ${effectiveTheme} theme. Apply the following design guidelines: ${themePrompt}`;
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

        for (const file of imageFiles) {
          try {
            // Generate upload URL
            const postUrl = await generateUploadUrl();

            // Upload file to Convex storage
            const result = await fetch(postUrl, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });

            const { storageId } = await result.json();

            // Create preview URL for display
            const fileReader = new FileReader();
            fileReader.onload = (e) => {
              addImages([e.target?.result as string], [storageId]);
            };
            fileReader.readAsDataURL(file);
          } catch (error) {
            console.error("Error uploading pasted image:", error);
            alert("Failed to upload pasted image. Please try again.");
          }
        }
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
  // Body background is now set in layout.tsx to prevent flash
  return (
    <div
      id="hero"
      className="relative -mt-[3vh] min-h-[90vh] bg-background px-0 pb-2 pt-[12vh] sm:min-h-[100vh] sm:pt-[15vh] md:mt-0 md:pt-[17vh]"
    >
      <HeroBackground />
      <div className="relative z-10 mx-auto flex w-[90%] flex-col items-center justify-center md:w-[66%]">
        <YCombinatorBadge />

        <div className="relative">
          <HeroGlassmorphism>
            {/* Input field with animated placeholder */}
            <div
              className={`relative z-10 mx-[8vw] flex min-h-[15vh] w-auto min-w-[120px] flex-col items-start justify-start pt-4 sm:mx-[12vw] sm:min-h-[20vh] sm:pt-8 md:mx-[95px] ${inputAreaHeight}`}
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
                <span className="flex h-full w-full items-center justify-center rounded-full bg-[#7CFF3F] text-black">
                  <Palette className="h-5 w-5" />
                </span>
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
                <img
                  src="/material-symbols_photo-rounded.svg"
                  alt="Photo"
                  className="h-full w-full object-cover object-center"
                  loading="lazy"
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
                      isLoading || !userInput.trim()
                        ? "not-allowed"
                        : "pointer",
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
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7CFF3F] text-black">
                  <Palette className="h-5 w-5" />
                </span>
                {selectedTheme && (
                  <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-[#7CFF3F]"></div>
                )}
              </button>
              <button
                type="button"
                className="relative h-10 w-10 p-0 transition-transform hover:scale-110 active:scale-95"
                onClick={triggerImageUpload}
              >
                <img
                  src="/material-symbols_photo-rounded.svg"
                  alt="Photo"
                  className="h-10 w-10 object-cover object-center"
                  loading="lazy"
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

            {/* Headline, Subtitle, and Project List */}
            <div className="relative z-10 w-full px-[5vw] md:px-[5vw]">
              <HeroHeadline />
              {/* Subtitle - shown for all users */}
              <div className="flex w-full flex-col items-center justify-center px-[5vw] md:px-[5vw]">
                {/* Action Buttons */}
                <div className="animate-fadeInSlideUpLate mt-8 flex flex-col-reverse items-center justify-start gap-4 md:inline-flex md:flex-row md:gap-8">
                  <button
                    id="learn-more-btn"
                    className="hover:bg-gradient-radial relative flex h-12 items-center justify-center gap-2.5 overflow-hidden rounded-[20px] border border-white px-6 py-2.5 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent"
                    style={{
                      background: "rgba(255, 255, 255, 0.1)",
                    }}
                    onClick={() => {
                      const element = document.getElementById("features");
                      if (element) {
                        element.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                    onMouseEnter={(e) => {
                      const shimmer = e.currentTarget.querySelector(
                        "#learn-more-shimmer",
                      ) as HTMLElement;
                      if (shimmer) shimmer.style.transform = "translateX(100%)";
                    }}
                    onMouseLeave={(e) => {
                      const shimmer = e.currentTarget.querySelector(
                        "#learn-more-shimmer",
                      ) as HTMLElement;
                      if (shimmer)
                        shimmer.style.transform = "translateX(-100%)";
                    }}
                  >
                    <div
                      id="learn-more-shimmer"
                      className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-out"
                    ></div>
                    <div className="justify-start font-['Geist'] text-base font-normal text-zinc-500">
                      Learn More
                    </div>
                    <div className="relative flex h-6 w-6 items-center justify-center overflow-hidden">
                      <svg
                        className="h-4 w-4 text-zinc-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                      </svg>
                    </div>
                  </button>
                  <SignedOut>
                    <SignInButton mode="modal" asChild>
                      <button
                        id="get-started-btn"
                        className="hover:bg-gradient-radial relative flex h-12 items-center justify-center gap-2.5 overflow-hidden rounded-[20px] border border-white px-6 py-2.5 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent"
                        style={{
                          background: "rgba(255, 255, 255, 0.1)",
                        }}
                        onMouseEnter={(e) => {
                          const shimmer = e.currentTarget.querySelector(
                            "#get-started-shimmer",
                          ) as HTMLElement;
                          if (shimmer)
                            shimmer.style.transform = "translateX(100%)";
                        }}
                        onMouseLeave={(e) => {
                          const shimmer = e.currentTarget.querySelector(
                            "#get-started-shimmer",
                          ) as HTMLElement;
                          if (shimmer)
                            shimmer.style.transform = "translateX(-100%)";
                        }}
                      >
                        <div
                          id="get-started-shimmer"
                          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-out"
                        ></div>
                        <div className="justify-start font-['Geist'] text-base font-normal text-zinc-500">
                          Get Started
                        </div>
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <button
                      id="see-projects-btn"
                      className="hover:bg-gradient-radial relative flex h-12 items-center justify-center gap-2.5 overflow-hidden rounded-[20px] border border-white px-6 py-2.5 outline outline-1 outline-white backdrop-blur-[80px] transition-all duration-200 hover:from-purple-200/30 hover:to-transparent"
                      style={{
                        background: "rgba(255, 255, 255, 0.1)",
                      }}
                      onClick={() => router.push("/web/dashboard")}
                      onMouseEnter={(e) => {
                        const shimmer = e.currentTarget.querySelector(
                          "#see-projects-shimmer",
                        ) as HTMLElement;
                        if (shimmer)
                          shimmer.style.transform = "translateX(100%)";
                      }}
                      onMouseLeave={(e) => {
                        const shimmer = e.currentTarget.querySelector(
                          "#see-projects-shimmer",
                        ) as HTMLElement;
                        if (shimmer)
                          shimmer.style.transform = "translateX(-100%)";
                      }}
                    >
                      <div
                        id="see-projects-shimmer"
                        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-out"
                      ></div>
                      <div className="justify-start font-['Geist'] text-base font-normal text-zinc-500">
                        My Projects
                      </div>
                    </button>
                  </SignedIn>
                </div>
              </div>
              {/* Call to action for signed-out users */}
              <SignedOut>
                <div className="mt-12 text-center">
                  {/* Remove the info text paragraph for signed-out users: */}
                  {/* <p className="mb-4 font-sans text-sm text-gray-600">Join thousands of builders creating amazing apps</p> */}
                </div>
              </SignedOut>
            </div>
          </HeroGlassmorphism>

          {/* Stats badges */}
          <StatsPill value={projectCount} label="Powering" position="left" />
          <StatsPill value={userCount} label="Join" position="right" />
        </div>
      </div>

      {/* Project List - Outside glassmorphism container for better performance */}
      {/* <SignedIn>
        <motion.div
          className="relative mx-auto mb-[8vh] mt-[4vh] w-[90%] md:w-[75%]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: [0, 0, 0.2, 1] as const }}
        >
          <div className="mb-[3vh] w-full text-center">
            <h2 className="mb-1 font-sans text-lg font-medium text-[#2C2C2C]">
                            My Projects
            </h2>
            <p className="font-sans text-sm text-gray-500">
              Continue working on your apps or start something new
            </p>
          </div>
          <div className="mx-auto w-full max-w-4xl">
            <MemoizedLandingProjectList />
          </div>
        </motion.div>
      </SignedIn> */}

      {/* Conditional margin for signed-out users */}
      <SignedOut>
        <div className="pb-28" />
      </SignedOut>

      {/* Theme Confirmation Modal */}
      <ThemeConfirmationModal
        isOpen={isThemeConfirmationOpen}
        onClose={() => setIsThemeConfirmationOpen(false)}
        onSelectTheme={handleThemeSelect}
        onSkip={handleSkipTheme}
      />
    </div>
  );
}
