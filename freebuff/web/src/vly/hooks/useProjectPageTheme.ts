"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect } from "react";

const LEGACY_PROJECT_THEME_STORAGE_KEYS = [
  "freebuff-web-vly-project-page-theme",
  "vly-project-page-theme",
];

export type ProjectPageTheme = "dark";

// Freebuff Web is dark-only. We keep this hook around to preserve the
// existing call sites in the project page while removing the toggle and
// stale localStorage values from the original Vly experience.
export function useProjectPageTheme() {
  const { setTheme } = useTheme();

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.setAttribute("data-project-theme", "dark");
    body.setAttribute("data-project-theme", "dark");
    html.classList.add("dark");

    try {
      for (const key of LEGACY_PROJECT_THEME_STORAGE_KEYS) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // no-op: localStorage can be unavailable in private contexts
    }

    setTheme("dark");

    return () => {
      html.removeAttribute("data-project-theme");
      body.removeAttribute("data-project-theme");
    };
  }, [setTheme]);

  const toggleProjectTheme = useCallback(() => {
    // No-op: dark mode is enforced for Freebuff Web.
  }, []);

  return {
    projectTheme: "dark" as const,
    isProjectDark: true,
    toggleProjectTheme,
  };
}
