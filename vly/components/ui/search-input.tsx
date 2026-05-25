"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";

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
      className={`flex flex-1 items-center justify-start gap-2 self-stretch rounded-[5px] bg-white px-5 py-2 outline outline-1 outline-offset-[-1px] outline-zinc-300 ${className}`}
    >
      <svg
        className="h-5 w-5 text-zinc-500"
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
        className="flex-1 justify-start border-none bg-transparent font-['Geist'] text-sm font-medium leading-tight text-black outline-none placeholder:font-['Geist'] placeholder:text-sm placeholder:font-medium placeholder:leading-tight placeholder:text-zinc-500"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-4 w-4 text-zinc-500" />
          <span className="sr-only">Clear search</span>
        </button>
      )}
    </div>
  );
};

export { SearchInput };
