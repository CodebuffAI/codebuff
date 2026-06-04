import React from "react";
import { ScrapeLinksToolProps } from "./toolTypes";
import { Link2 } from "lucide-react";

export const ScrapeWebsiteTool: React.FC<ScrapeLinksToolProps> = ({ data }) => {
  const getTypeDisplay = (type: string) => {
    switch (type) {
      case "crawl_links":
        return "Crawling Links";
      case "scrape_content":
        return "Scraping Content";
      case "extract_styles":
        return "Extracting Styles";
      default:
        return type;
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200/50 bg-white/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-zinc-600" />
        <h3 className="text-sm font-semibold text-zinc-800">Scraping Links</h3>
      </div>
      <div className="space-y-1">
        {data.links.map((link, index) => (
          <div key={index} className="rounded bg-white/50 px-2 py-1">
            <div className="text-xs font-medium text-zinc-700">
              {getTypeDisplay(link.type)}
            </div>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              {link.url}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};
