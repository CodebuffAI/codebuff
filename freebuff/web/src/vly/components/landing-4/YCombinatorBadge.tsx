// Server component - no "use client" directive

export function YCombinatorBadge() {
  return (
    <div className="animate-fadeInSlideDown mb-[2vh] flex items-center justify-center gap-2">
      <div className="font-sans text-[10px] font-normal leading-none text-zinc-800 sm:text-sm">
        Backed by
      </div>
      <div className="flex h-4 w-4 items-center justify-center bg-[#A27EBC] px-1 py-1 sm:h-6 sm:w-6 sm:px-1.5 sm:py-1.5">
        <div className="font-sans text-[10px] font-medium leading-none text-white sm:text-sm">
          Y
        </div>
      </div>
      <div className="font-sans text-[10px] font-normal leading-none text-zinc-800 sm:text-sm">
        Combinator
      </div>
    </div>
  );
}
