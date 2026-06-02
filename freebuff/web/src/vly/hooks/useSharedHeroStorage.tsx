"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useHeroStorage } from "./useHeroStorage";

interface HeroStorageContextType {
  userInput: string;
  uploadedImages: string[];
  uploadedImageIds: any[];
  selectedTheme: string;
  isHydrated: boolean;
  updateUserInput: (text: string) => void;
  addImages: (images: string[], imageIds: any[]) => void;
  removeImage: (index: number) => void;
  updateSelectedTheme: (theme: string) => void;
  clearAllStorage: () => void;
  saveCurrentState: () => void;
}

const HeroStorageContext = createContext<HeroStorageContextType | null>(null);

interface HeroStorageProviderProps {
  children: ReactNode;
}

export function HeroStorageProvider({ children }: HeroStorageProviderProps) {
  const heroStorage = useHeroStorage();

  return (
    <HeroStorageContext.Provider value={heroStorage}>
      {children}
    </HeroStorageContext.Provider>
  );
}

export function useSharedHeroStorage() {
  const context = useContext(HeroStorageContext);
  if (!context) {
    throw new Error(
      "useSharedHeroStorage must be used within a HeroStorageProvider",
    );
  }
  return context;
}
