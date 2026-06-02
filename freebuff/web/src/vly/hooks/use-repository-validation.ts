"use client";

import { useState, useEffect, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

interface ValidationState {
  isValidating: boolean;
  isValid: boolean | null;
  message: string;
}

export function useRepositoryValidation(
  repositoryName: string,
  debounceMs: number = 500,
) {
  const [validationState, setValidationState] = useState<ValidationState>({
    isValidating: false,
    isValid: null,
    message: "",
  });

  const validateRepositoryName = useAction(
    api.github.repositories.validateRepositoryName,
  );

  const validate = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        setValidationState({
          isValidating: false,
          isValid: null,
          message: "",
        });
        return;
      }

      setValidationState((prev) => ({
        ...prev,
        isValidating: true,
      }));

      try {
        const result = await validateRepositoryName({ name });
        setValidationState({
          isValidating: false,
          isValid: result.available,
          message: result.message,
        });
      } catch (error) {
        setValidationState({
          isValidating: false,
          isValid: false,
          message: "Failed to validate repository name",
        });
      }
    },
    [validateRepositoryName],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validate(repositoryName);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [repositoryName, debounceMs, validate]);

  // Reset validation when name is cleared
  useEffect(() => {
    if (!repositoryName.trim()) {
      setValidationState({
        isValidating: false,
        isValid: null,
        message: "",
      });
    }
  }, [repositoryName]);

  return validationState;
}
