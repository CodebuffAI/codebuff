"use node";

const KAPA_API_URL = process.env.KAPA_API_URL!;
const KAPA_API_KEY = process.env.KAPA_API_KEY!;

interface KapaResponse {
  answer: string;
  thread_id: string;
  question_answer_id: string;
  is_uncertain: boolean;
  relevant_sources: Array<{
    source_url: string;
    title: string;
    contains_internal_data: boolean;
  }>;
}

/**
 * Search using Kapa.ai API for Convex documentation
 * @param query The search query
 * @returns Formatted search results with answer and sources
 */
export async function kapaSearch(query: string): Promise<string> {
  try {
    const response = await fetch(KAPA_API_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": KAPA_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: KapaResponse = await response.json();

    // Format the response with answer and sources
    let formatted = `**Answer:**\n${data.answer}\n\n`;

    if (data.relevant_sources && data.relevant_sources.length > 0) {
      formatted += `**Sources:**\n`;
      data.relevant_sources.forEach((source, index) => {
        formatted += `${index + 1}. [${source.title}](${source.source_url})\n`;
      });
    }

    return formatted;
  } catch (error) {
    console.error("[Kapa Search] Error:", error);
    throw new Error(
      `Kapa search failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
