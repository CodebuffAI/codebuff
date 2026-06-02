"use client";

import { toast } from "sonner";
import { PageLayout } from "./test-landing";

export function ContactPage() {
  return (
    <PageLayout showHome={true} showParallax={false}>
      {/* Vertical flex container with one line containing the contact email, next line containing a button to copy the email, then a section after saying "Or join our discord server here:" with the discord join button*/}
      <div className="flex flex-col items-center justify-center gap-4 py-48">
        {/* Slim text that is aesthetic and unique and spaced out*/}
        <div className="text-xl">
          Contact us at our email:{" "}
          <span
            className="cursor-pointer text-blue-500 hover:underline"
            onClick={() => {
              navigator.clipboard.writeText("team@freebuff.com");
              toast.success("Email copied to clipboard!");
            }}
          >
            team@freebuff.com (click to copy)
          </span>
        </div>
        <div className="text-xl">
          Or join our discord server here:{" "}
          {/** highlighted text with a hover effect */}
          <a
            href="https://discord.gg/yXG3w7wxfs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Discord
          </a>
        </div>
      </div>
    </PageLayout>
  );
}
