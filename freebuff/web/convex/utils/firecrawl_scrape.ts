"use node";
import FirecrawlApp from "@mendable/firecrawl-js";

async function extractWithFirecrawl(url: string): Promise<string> {
  try {
    console.log(`Starting extraction for URL: ${url}`);

    // Check API key early
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error(
        "Firecrawl API key is missing. Please set the FIRECRAWL_API_KEY environment variable.",
      );
    }

    // Initialize Firecrawl with your API key
    console.log("Initializing FirecrawlApp...");
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

    // Set up parameters for the extraction
    const params: any = {
      formats: ["markdown"],
      onlyMainContent: true,
    };

    console.log("Params for scrapeUrl:", JSON.stringify(params, null, 2));

    // Perform the extraction
    console.log("Calling scrapeUrl...");
    const result = await app.scrapeUrl(url, params);

    // Log the result for debugging
    console.log("Firecrawl result:", JSON.stringify(result, null, 2));

    // Check if result indicates an error
    if ("error" in result && result.error) {
      throw new Error(`Firecrawl error: ${result.error}`);
    }

    // Check if success is explicitly false
    if ("success" in result && result.success === false) {
      throw new Error("Firecrawl error: The request was not successful");
    }

    // Extract markdown content
    const extractedContent = result.markdown || "";

    console.log(
      `Extraction complete. Content length: ${extractedContent.length} characters`,
    );
    return extractedContent;
  } catch (error) {
    console.error("Error extracting data with Firecrawl:", error);

    // Check if API key is missing
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error(
        "Firecrawl API key is missing. Please set the FIRECRAWL_API_KEY environment variable.",
      );
    }

    throw error;
  }
}

async function crawlUrlLinks(url: string): Promise<string[]> {
  try {
    console.log(`Starting mapping for URL: ${url}`);

    // Check API key early
    if (!process.env.FIRECRAWL_API_KEY) {
      throw new Error(
        "Firecrawl API key is missing. Please set the FIRECRAWL_API_KEY environment variable.",
      );
    }

    // Initialize Firecrawl with your API key
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

    // Call crawlUrl with the simplified parameter structure
    const crawlResponse = await app.crawlUrl(url, {
      limit: 1, // Just crawl the main URL
      scrapeOptions: {
        formats: ["links"],
        onlyMainContent: true,
      },
    });

    if (!crawlResponse.success) {
      throw new Error(
        `Failed to crawl: ${crawlResponse.error || "Unknown error"}`,
      );
    }

    // Extract links directly from the response
    let links: string[] = [];
    if (crawlResponse.data && Array.isArray(crawlResponse.data)) {
      crawlResponse.data.forEach((page) => {
        if (page.links && Array.isArray(page.links)) {
          links = links.concat(page.links);
        }
      });
    }

    console.log(`Mapping complete. Found ${links.length} links.`);
    return links;
  } catch (error) {
    console.error("Error mapping URL with Firecrawl:", error);
    throw error;
  }
}

// Export all functions
export { crawlUrlLinks, extractWithFirecrawl };
