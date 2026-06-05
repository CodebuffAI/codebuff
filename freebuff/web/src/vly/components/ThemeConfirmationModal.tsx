"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { ThemePickerLayout } from "@/vly/components/ThemePickerLayout";

interface ThemeConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTheme: (theme: string) => void;
  onSkip: () => void;
}

export default function ThemeConfirmationModal({
  isOpen,
  onClose,
  onSelectTheme,
  onSkip,
}: ThemeConfirmationModalProps) {
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null);

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

  const handleThemeSelect = (theme: string) => {
    onSelectTheme(theme);
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
        <ThemePickerLayout
          title={
            <>
              Wait! Do you want to add a{" "}
              <span className="text-primary">Style</span>?
            </>
          }
          subtitle="Select a visual theme to enhance your project"
          hoveredTheme={hoveredTheme}
          onThemeSelect={handleThemeSelect}
          onThemeHover={setHoveredTheme}
          onClose={onClose}
          footerContent={
            <>
              <div className="text-sm text-muted-foreground">
                <span>
                  Choose a theme to style your project, or skip to continue
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-border bg-card px-4 py-2 font-['Geist'] text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={onSkip}
                >
                  No thanks, continue
                </button>
              </div>
            </>
          }
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
