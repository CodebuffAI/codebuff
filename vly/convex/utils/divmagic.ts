import { internal } from "!/_generated/api";
import { Id } from "!/_generated/dataModel";
import { ActionCtx } from "!/_generated/server";

/**
 * Scrape a website using DivMagic API and store the results
 *
 * @param ctx - The action context from the parent function
 * @param url - The URL to scrape
 * @param projectId - The project ID to associate the scraped content with
 * @returns The cleaned content from the scrape
 */
export async function scrapeWebsite(
  ctx: ActionCtx,
  args: {
    url: string;
    projectId: Id<"project">;
  },
): Promise<string> {
  const { url, projectId } = args;

  // Get DivMagic API key from environment variables
  const apiKey = process.env.DIVMAGIC_API_KEY;
  if (!apiKey) {
    throw new Error("DIVMAGIC_API_KEY is not set in environment variables");
  }

  // Call DivMagic API
  try {
    const response = await fetch("https://api.divmagic.com/v1/magic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey: apiKey, // Using the apiKey from environment variables
        url: url,
        settings: {
          componentFormat: "jsx",
          styleFormat: "tailwind",
          includeMediaQuery: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DivMagic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // Extract the content - DivMagic API may return data in different formats
    const rawContent =
      data.component || data.content || data.html || data.result || "";

    // Check if content is too large (exceeds 80,000 characters)
    if (rawContent.length > 80000) {
      return "Website is too big. Coming soon: cleaning up large HTML styling.";
    }

    // Clean up the content
    const cleanedContent = cleanContent(rawContent);

    // Store in database directly
    await ctx.runMutation(internal.scraped_site_logs.create, {
      url,
      raw_content: rawContent,
      cleaned_content: cleanedContent,
      date: Date.now(),
      project: projectId,
    });

    return rawContent;
  } catch (error) {
    console.error("Error scraping website:", error);
    throw error;
  }
}

/**
 * Clean up the content from DivMagic
 */
function cleanContent(content: string): string {
  // Remove excessive whitespace
  let cleaned = content.replace(/\s+/g, " ");

  // Normalize line breaks
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // Remove any HTML tags that might remain
  cleaned = cleaned.replace(/<[^>]*>/g, "");

  // Trim extra whitespace
  cleaned = cleaned.trim();

  return cleaned;
}
