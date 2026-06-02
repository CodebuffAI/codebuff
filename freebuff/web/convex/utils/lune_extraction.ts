"use node";

import axios from "axios";

interface LuneContextRequest {
  user_query_summary: string;
  top_k?: number;
  stream?: boolean;
}

interface LuneContextResponse {
  context_chunks: {
    content: string;
    metadata: {
      source: string;
      [key: string]: any;
    };
  }[];
}

interface LuneChunksRequest {
  lune_ids: string[];
  user_query: string;
  top_k?: number;
}

interface LuneChunk {
  content: string;
  source: string;
}

interface LuneChunksResponse {
  chunks: LuneChunk[];
}

/**
 * Retrieves context information for a query using the Lune API
 * @param query The user query to get context for
 * @param apiKey The Lune API key
 * @param topK Number of context chunks to return (default: 4)
 * @returns Array of strings containing the content of each context chunk
 */
export async function getLuneContext(
  query: string,
  topK: number = 4,
): Promise<string> {
  try {
    const requestOptions: LuneContextRequest = {
      user_query_summary: query,
      top_k: topK,
      stream: false,
    };

    const response = await axios.post<LuneContextResponse>(
      "https://api.lune.dev/chat/get_context_for_query",
      requestOptions,
      {
        headers: {
          Authorization: `Bearer ${process.env.LUNE_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    // Return array of content strings from context chunks
    //return response.data.context_chunks.map((chunk) => chunk.content);
    return JSON.stringify(response.data.context_chunks);
  } catch (error) {
    console.error("Error querying Lune API:", error);
    throw new Error("Failed to get context from Lune API");
  }
}

/**
 * Retrieves context chunks from specific Lunes using the Lune API
 * @param luneIds Array of Lune IDs to query
 * @param query The user query to get context for
 * @param topK Number of chunks to return (default: 5)
 * @returns JSON string containing chunks with content and sources
 */
export async function getChunksFromLunes(
  luneIds: string[],
  query: string,
  topK: number = 5,
): Promise<string> {
  try {
    const requestOptions: LuneChunksRequest = {
      lune_ids: luneIds,
      user_query: query,
      top_k: topK,
    };

    const response = await axios.post<LuneChunksResponse>(
      "https://api.lune.dev/chat/get_chunks_from_lunes",
      requestOptions,
      {
        headers: {
          Authorization: `Bearer ${process.env.LUNE_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    return JSON.stringify(response.data.chunks);
  } catch (error) {
    console.error("Error querying Lune chunks API:", error);
    throw new Error("Failed to get chunks from Lunes API");
  }
}
