// ... existing imports ...

function processChunk(chunk: string): string {
  const fileBlockRegex = /<file[\s\S]*?<\/file>/g;
  return chunk.replace(fileBlockRegex, (match) => {
    const firstLine = match.split('\n')[0];
    return `${firstLine}\n...\n</file>`;
  });
}

async function streamResponse(
  response: ChatCompletionStream,
  ws: WebSocket,
  messageId: string
): Promise<string> {
  let fullResponse = '';
  let currentChunk = '';

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullResponse += content;
    currentChunk += content;

    // Process the chunk when we have a complete sentence or a significant amount of text
    if (content.includes('.') || content.includes('\n') || currentChunk.length > 100) {
      const processedChunk = processChunk(currentChunk);
      ws.send(JSON.stringify({ type: 'chunk', content: processedChunk, messageId }));
      currentChunk = '';
    }
  }

  // Send any remaining content
  if (currentChunk) {
    const processedChunk = processChunk(currentChunk);
    ws.send(JSON.stringify({ type: 'chunk', content: processedChunk, messageId }));
  }

  return fullResponse;
}

// ... rest of the existing code ...