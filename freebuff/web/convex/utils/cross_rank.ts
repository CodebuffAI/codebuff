"use node";

/**
 * Interface for file data to be ranked
 */
export interface FileData {
  filename: string;
  code: string;
}

/**
 * Ranks files based on relevance to a query using the ranker API
 * @param query The search query to rank files against
 * @param files Array of file data objects containing filename and code
 * @param tokenLimit Optional token limit for the API request
 * @param threshold Optional threshold for the score of the files to be returned: https://docs.relace.ai/docs/code-reranker/overview
 * @returns Promise resolving to an array of filenames sorted by relevance
 */
export async function crossRank(
  query: string,
  files: FileData[],
  tokenLimit: number = 12000,
  threshold: number = 0.1,
): Promise<string[]> {
  const url = "https://ranker.endpoint.relace.run/v2/code/rank";
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer rlc-6C1yrgfI5loSt9VgXNvLRop0pDm7TTvsmpASyA",
  };

  const data = {
    query,
    codebase: files,
    token_limit: tokenLimit,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });

    const result = await response.json();
    const rankedFiles = result.results as { filename: string; score: number }[];

    // filter out files with score below threshold
    // sort with least important first
    const filteredFiles = rankedFiles
      .filter((file) => file.score > threshold)
      .sort((a, b) => a.score - b.score);

    // return only file paths, decending order
    return filteredFiles.map((file) => file.filename);
  } catch (error) {
    throw new Error(`Ranking API call failed: ${error}`);
  }
}
