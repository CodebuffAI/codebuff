"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useDebounce } from "@/vly/lib/hooks/use-debounce";

interface SearchInputProps {
  onSearch?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchInput: React.FC<SearchInputProps> = ({
  onSearch,
  placeholder = "Search by project name",
  className = "",
}) => {
  const [value, setValue] = React.useState("");
  const debouncedValue = useDebounce(value, 300);

  React.useEffect(() => {
    onSearch?.(debouncedValue);
  }, [debouncedValue, onSearch]);

  const handleClear = () => {
    setValue("");
  };

  return (
    <div
      className={`flex h-10 flex-1 items-center justify-start gap-2 self-stretch rounded-lg bg-muted/40 px-4 transition-colors focus-within:bg-muted/55 ${className}`}
    >
      <svg
        className="h-4 w-4 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1 justify-start border-none bg-transparent font-sans text-sm font-medium leading-tight text-foreground outline-none placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:leading-tight placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center justify-center rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Clear search</span>
        </button>
      )}
    </div>
  );
};

export { SearchInput };
