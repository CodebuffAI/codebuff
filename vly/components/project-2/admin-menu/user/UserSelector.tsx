"use client";

import { useState, memo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserInfo } from "../types";

interface UserSelectorProps {
  selectedUser: UserInfo | null;
  onSelectUser: (user: UserInfo) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResults: UserInfo[] | undefined;
  projectOwner: UserInfo | null;
}

const UserSelectorComponent = ({
  selectedUser,
  onSelectUser,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  projectOwner,
}: UserSelectorProps) => {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="grid gap-2.5">
      <Label
        htmlFor="user"
        className="text-xs font-semibold uppercase tracking-wide text-zinc-700"
      >
        Select User
      </Label>
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={searchOpen}
            className="h-10 w-full justify-between border-zinc-300 bg-white transition-all hover:border-zinc-400 hover:bg-zinc-50"
          >
            <div className="flex items-center gap-2">
              <span>
                {selectedUser
                  ? `${selectedUser.name} (${selectedUser.email})`
                  : "Select user..."}
              </span>
              {selectedUser && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={
                          projectOwner?._id === selectedUser._id
                            ? "h-5 border-green-500 bg-green-50 px-1.5 py-0 text-[10px] font-medium text-green-700"
                            : "h-5 border-orange-500 bg-orange-50 px-1.5 py-0 text-[10px] font-medium text-orange-700"
                        }
                      >
                        {projectOwner?._id === selectedUser._id
                          ? "Owner"
                          : "Not Owner"}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {projectOwner?._id === selectedUser._id
                          ? "The owner of the current project"
                          : "Not the owner of the current project"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-zinc-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[620px] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search by email or Clerk ID..."
              value={searchQuery}
              onValueChange={onSearchQueryChange}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>
                {searchQuery.length === 0
                  ? "Type to search users"
                  : "No users found"}
              </CommandEmpty>
              <CommandGroup>
                {searchResults?.slice(0, 50).map((user) => (
                  <CommandItem
                    key={user._id}
                    value={user.email}
                    onSelect={() => {
                      onSelectUser(user);
                      setSearchOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedUser?._id === user._id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{user.name}</span>
                        {projectOwner?._id === user._id && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className="h-5 border-green-500 bg-green-50 px-1.5 py-0 text-[10px] font-medium text-green-700"
                                >
                                  Owner
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>The owner of the current project</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {user.email}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {user.clerk_id}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const UserSelector = memo(UserSelectorComponent);
