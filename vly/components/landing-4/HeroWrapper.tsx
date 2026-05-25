import { HeroBackground } from "./HeroBackground";
import { YCombinatorBadge } from "./YCombinatorBadge";
import { HeroHeadline } from "./HeroHeadline";
import { HeroClient } from "./HeroClient";
import { ActionButtons } from "./ActionButtons";
import { SignedOut } from "@/components/auth/AuthComponents";

interface HeroWrapperProps {
  isThemePickerOpen: boolean;
  setIsThemePickerOpen: (open: boolean) => void;
}

export default function HeroWrapper({
  isThemePickerOpen,
  setIsThemePickerOpen,
}: HeroWrapperProps) {
  return (
    <div
      id="hero"
      className="prevent-layout-shift relative -mt-[3vh] min-h-[90vh] px-0 pb-2 pt-[12vh] sm:min-h-[100vh] sm:pt-[15vh] md:mt-0 md:pt-[17vh]"
      style={{
        backgroundColor: "#D3C1E5",
        minHeight: "90vh",
      }}
    >
      <HeroBackground />
      <div className="relative z-10 mx-auto flex w-[90%] flex-col items-center justify-center md:w-[66%]">
        <YCombinatorBadge />

        <div className="relative">
          <HeroClient
            isThemePickerOpen={isThemePickerOpen}
            setIsThemePickerOpen={setIsThemePickerOpen}
          />

          {/* Headline and Action Buttons */}
          <div className="relative z-10 -mt-[8vh] w-full px-[5vw] md:-mt-[6vh] md:px-[5vw]">
            <HeroHeadline />
            <ActionButtons />
            {/* Call to action for signed-out users */}
            <SignedOut>
              <div className="mt-12 text-center">
                {/* Remove the info text paragraph for signed-out users: */}
                {/* <p className="mb-4 font-sans text-sm text-gray-600">Join thousands of builders creating amazing apps</p> */}
              </div>
            </SignedOut>
          </div>
        </div>
      </div>

      {/* Conditional margin for signed-out users */}
      <SignedOut>
        <div className="pb-12" />
      </SignedOut>
    </div>
  );
}
