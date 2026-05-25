"use client";

import { Search, X, ChevronDown, ChevronUp, Replace } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface SearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string, options: SearchOptions) => void;
  onReplace: (
    findText: string,
    replaceText: string,
    replaceAll?: boolean,
  ) => void;
  searchResults?: {
    currentMatch: number;
    totalMatches: number;
  };
}

interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export function SearchPanel({
  isOpen,
  onClose,
  onSearch,
  onReplace,
  searchResults,
}: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchQuery) {
      onSearch(searchQuery, options);
    }
  }, [searchQuery, options, onSearch]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        // Find previous
        onSearch(searchQuery, { ...options, findPrevious: true } as any);
      } else {
        // Find next
        onSearch(searchQuery, { ...options, findNext: true } as any);
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const handleReplace = () => {
    if (searchQuery && replaceText !== undefined) {
      onReplace(searchQuery, replaceText, false);
    }
  };

  const handleReplaceAll = () => {
    if (searchQuery && replaceText !== undefined) {
      onReplace(searchQuery, replaceText, true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute right-4 top-0 z-50 w-80 rounded-lg border bg-white p-3 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Search className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium">Find</span>
          {showReplace && (
            <span className="text-sm text-gray-500">& Replace</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setShowReplace(!showReplace)}
            title="Toggle Replace"
          >
            <Replace className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find"
            className="h-7 flex-1 text-xs"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() =>
              onSearch(searchQuery, { ...options, findPrevious: true } as any)
            }
            disabled={!searchQuery || !searchResults?.totalMatches}
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() =>
              onSearch(searchQuery, { ...options, findNext: true } as any)
            }
            disabled={!searchQuery || !searchResults?.totalMatches}
            title="Next match (Enter)"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>

        {searchResults && searchResults.totalMatches > 0 && (
          <div className="px-1 text-xs text-gray-500">
            {searchResults.currentMatch} of {searchResults.totalMatches}
          </div>
        )}

        {showReplace && (
          <>
            <div className="flex items-center gap-1">
              <Input
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace"
                className="h-7 flex-1 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={handleReplace}
                disabled={!searchQuery}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={handleReplaceAll}
                disabled={!searchQuery}
              >
                All
              </Button>
            </div>
          </>
        )}

        <Separator />

        <div className="flex items-center gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={options.caseSensitive}
              onChange={(e) =>
                setOptions({ ...options, caseSensitive: e.target.checked })
              }
              className="h-3 w-3"
            />
            <span>Aa</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={options.wholeWord}
              onChange={(e) =>
                setOptions({ ...options, wholeWord: e.target.checked })
              }
              className="h-3 w-3"
            />
            <span>Ab</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              checked={options.regex}
              onChange={(e) =>
                setOptions({ ...options, regex: e.target.checked })
              }
              className="h-3 w-3"
            />
            <span>.*</span>
          </label>
        </div>
      </div>
    </div>
  );
}
