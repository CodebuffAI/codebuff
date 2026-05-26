"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";

const PROJECT_THEME_STORAGE_KEY = "vly-project-page-theme";

export type ProjectPageTheme = "light" | "dark";

function getStoredProjectTheme(): ProjectPageTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const storedTheme = window.localStorage.getItem(PROJECT_THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {
    // no-op: localStorage can be unavailable in private contexts
  }

  return "light";
}

export function useProjectPageTheme() {
  const { theme, setTheme } = useTheme();
  const previousGlobalThemeRef = useRef<string | null>(null);

  const [projectTheme, setProjectTheme] = useState<ProjectPageTheme>(
    getStoredProjectTheme,
  );

  useEffect(() => {
    if (previousGlobalThemeRef.current) {
      return;
    }

    if (theme) {
      previousGlobalThemeRef.current = theme;
      return;
    }

    if (typeof window !== "undefined") {
      previousGlobalThemeRef.current =
        window.localStorage.getItem("theme") ?? "light";
    }
  }, [theme]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.setAttribute("data-project-theme", projectTheme);
    body.setAttribute("data-project-theme", projectTheme);

    try {
      window.localStorage.setItem(PROJECT_THEME_STORAGE_KEY, projectTheme);
    } catch {
      // no-op: localStorage can be unavailable in private contexts
    }

    setTheme(projectTheme);
  }, [projectTheme, setTheme]);

  useEffect(() => {
    return () => {
      const html = document.documentElement;
      const body = document.body;

      html.removeAttribute("data-project-theme");
      body.removeAttribute("data-project-theme");

      setTheme(previousGlobalThemeRef.current ?? "light");
    };
  }, [setTheme]);

  const toggleProjectTheme = useCallback(() => {
    setProjectTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  }, []);

  return {
    projectTheme,
    isProjectDark: projectTheme === "dark",
    toggleProjectTheme,
  };
}
