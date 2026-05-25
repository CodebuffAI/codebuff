// Context7 API helper functions for fetching library documentation

/**
 * Search Context7 API for libraries and services
 * @param query Search query to find relevant libraries
 * @returns Search results with library information
 */
export async function searchContext7Libraries(query: string) {
  try {
    const url = new URL("https://context7.com/api/v1/search");
    url.searchParams.set("query", query);

    const response = await fetch(url);
    if (!response.ok) {
      const errorCode = response.status;
      if (errorCode === 429) {
        console.error(`Context7 rate limited. Please try again later.`);
        return {
          results: [],
          error: `Context7 rate limited. Please try again later.`,
        };
      }
      console.error(
        `Failed to search Context7 libraries. Error code: ${errorCode}`,
      );
      return {
        results: [],
        error: `Failed to search Context7 libraries. Error code: ${errorCode}`,
      };
    }

    return await response.json();
  } catch (error) {
    console.error("Error searching Context7 libraries:", error);
    return {
      results: [],
      error: `Error searching Context7 libraries: ${error}`,
    };
  }
}

/**
 * Fetch detailed documentation for a specific library from Context7
 * @param libraryId Library ID from Context7 (e.g., "/twilio/twilio-node")
 * @param options Optional parameters for tokens and topic
 * @returns Documentation text or null if not available
 * @throws Error if API request fails
 */
export async function fetchContext7Documentation(
  libraryId: string,
  options: {
    tokens?: number;
    topic?: string;
  } = {},
) {
  if (libraryId.startsWith("/")) {
    libraryId = libraryId.slice(1);
  }

  const url = new URL(`https://context7.com/api/v1/${libraryId}`);
  if (options.tokens) url.searchParams.set("tokens", options.tokens.toString());
  if (options.topic) url.searchParams.set("topic", options.topic);
  url.searchParams.set("type", "txt");

  const response = await fetch(url, {
    headers: {
      "X-Context7-Source": "mcp-server",
    },
  });

  if (!response.ok) {
    const errorCode = response.status;
    if (errorCode === 429) {
      throw new Error(`Context7 rate limited. Please try again later.`);
    }
    throw new Error(
      `Failed to fetch Context7 documentation. Error code: ${errorCode}`,
    );
  }

  const text = await response.text();
  if (
    !text ||
    text === "No content available" ||
    text === "No context data available"
  ) {
    return null;
  }

  return text;
}
