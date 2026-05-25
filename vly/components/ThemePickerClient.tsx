"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { isThemeName, themePrompts } from "@/lib/theme-prompts";
import { useSharedHeroStorage } from "@/hooks/useSharedHeroStorage";
import ThemePickerServer from "./ThemePickerServer";

interface ThemePickerClientProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
}

export default function ThemePickerClient({
  isOpen,
  onClose,
  projectId,
}: ThemePickerClientProps) {
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use the shared storage hook
  const { selectedTheme, updateSelectedTheme } = useSharedHeroStorage();

  // Mutation for sending message to agent
  const saveMessageAndStartWorkflow = useMutation(
    api.coding_agent.trigger.saveMessageAndStartWorkflow,
  );

  // Clean up old localStorage key for backward compatibility
  useEffect(() => {
    if (typeof window !== "undefined") {
      const oldSaved = localStorage.getItem("pendingHeroTheme");
      if (oldSaved && !selectedTheme && isThemeName(oldSaved)) {
        updateSelectedTheme(oldSaved);
      }
      if (oldSaved) {
        localStorage.removeItem("pendingHeroTheme");
      }
    }
  }, [isOpen, selectedTheme, updateSelectedTheme]);

  // Handle Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Check if we're in the browser
  if (typeof window === "undefined") return null;

  const handleThemeSelect = async (theme: string) => {
    setIsSubmitting(true);

    try {
      // Update theme using the shared storage hook
      updateSelectedTheme(theme);

      // If we have a project ID, send the theme prompt to the agent
      if (projectId && isThemeName(theme)) {
        const themePrompt = themePrompts[theme];
        const message = `Please update the project's theme to ${theme}. Apply the following design guidelines: ${themePrompt}`;

        await saveMessageAndStartWorkflow({
          projectSemanticIdentifier: projectId,
          message: message,
          displayMessage: `Please update the project's theme to ${theme}.`,
        });
      }

      onClose();
    } catch (error) {
      console.error("Failed to apply theme:", error);
      toast.error("Failed to apply theme. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 10000,
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "auto",
      }}
    >
      {/* Backdrop with fade animation */}
      <motion.div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        style={{ zIndex: 1 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      {/* Modal with smoother animation */}
      <motion.div
        className="relative mx-auto flex w-full items-center justify-center"
        style={{ zIndex: 2, willChange: "transform" }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{
          type: "spring",
          damping: 25,
          stiffness: 300,
          duration: 0.2,
        }}
      >
        <ThemePickerServer
          selectedTheme={selectedTheme}
          isSubmitting={isSubmitting}
          onThemeSelect={handleThemeSelect}
          onClose={onClose}
          hoveredTheme={hoveredTheme ?? undefined}
          onThemeHover={setHoveredTheme}
        />
      </motion.div>
    </div>
  );

  // Ensure we have a portal container
  let portalContainer = document.getElementById("modal-portal");
  if (!portalContainer) {
    portalContainer = document.createElement("div");
    portalContainer.id = "modal-portal";
    portalContainer.style.position = "fixed";
    portalContainer.style.inset = "0";
    portalContainer.style.zIndex = "9999";
    portalContainer.style.pointerEvents = "none";
    document.body.appendChild(portalContainer);
  }

  return createPortal(modalContent, portalContainer);
}
