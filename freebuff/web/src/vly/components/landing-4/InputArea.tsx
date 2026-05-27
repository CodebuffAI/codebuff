"use client";

import React, { useState, useEffect, useCallback, memo } from "react";
import Image from "next/image";
import { ThemeBadge } from "../ui/ThemeBadge";
import {
  allSuggestions,
  getRandomSuggestions,
  getDefaultSuggestions,
} from "./suggestions";
import { TypingAnimation } from "./TypingAnimation";

interface InputAreaProps {
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
}

export const InputArea = memo(
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
  }: InputAreaProps) => {
    const [displayedSuggestions, setDisplayedSuggestions] = useState<
      typeof allSuggestions
    >(getDefaultSuggestions());
    const [, setMounted] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionsVisible, setSuggestionsVisible] = useState(false);

    // Initialize and randomize suggestions after hydration
    useEffect(() => {
      const handle = requestAnimationFrame(() => setMounted(true));
      // Randomize suggestions once hydrated to avoid seeing same ones every time
      // Use setTimeout to defer setState and avoid synchronous state updates in effect
      let suggestionsTimer: ReturnType<typeof setTimeout> | undefined;
      if (isHydrated) {
        suggestionsTimer = setTimeout(
          () => setDisplayedSuggestions(getRandomSuggestions()),
          0,
        );
      }
      return () => {
        cancelAnimationFrame(handle);
        if (suggestionsTimer) clearTimeout(suggestionsTimer);
      };
    }, [isHydrated]);

    // Handle suggestions visibility with smooth transitions
    useEffect(() => {
      const shouldShow = userInput === "" && isHydrated;
      if (shouldShow) {
        // Show suggestions DOM first - use timeout to batch state updates
        const showTimer = setTimeout(() => setShowSuggestions(true), 0);
        // Then fade in with a small delay to ensure smooth transition
        const fadeInTimer = setTimeout(() => setSuggestionsVisible(true), 10);
        return () => {
          clearTimeout(showTimer);
          clearTimeout(fadeInTimer);
        };
      } else {
        // Fade out first - use setTimeout to defer setState and avoid synchronous updates
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
                <Image
                  src={image}
                  alt={`Uploaded ${index + 1}`}
                  width={48}
                  height={48}
                  sizes="(max-width: 640px) 40px, 48px"
                  className="h-10 w-auto rounded-lg object-contain sm:h-12"
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
            <div className="pointer-events-none absolute left-0 top-0 min-h-[24px] w-full text-left font-sans font-normal text-gray-500 md:left-0">
              <span className="inline-block min-w-[300px]">
                Start typing to start creating. Ask vly to <TypingAnimation />
              </span>
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
        {/* Suggestions bar - Always reserve space to prevent layout shifts */}
        <div
          className={`${isMultiLine ? "mt-[5vh] sm:mt-[6vh]" : "mt-[4vh] sm:mt-[4vh]"} flex max-w-full flex-wrap items-center justify-start gap-2 transition-opacity duration-300 sm:gap-4 md:mt-[2vh] ${showSuggestions && suggestionsVisible ? "opacity-100" : "opacity-0"} min-h-[52px]`}
        >
          {showSuggestions && (
            <>
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
            </>
          )}
        </div>
      </>
    );
  },
);

InputArea.displayName = "InputArea";
