import { useState, useCallback, useRef, useEffect } from "react";
import { Id } from "@/convex/_generated/dataModel";

export interface QueuedMessage {
  id: string;
  message: string;
  images: Id<"_storage">[];
  timestamp: number;
}

interface UseMessageQueueOptions {
  onProcessMessage: (
    message: string,
    images: Id<"_storage">[],
  ) => Promise<void>;
  isProcessing: boolean;
}

interface UseMessageQueueReturn {
  queue: QueuedMessage[];
  addToQueue: (message: string, images: Id<"_storage">[]) => void;
  clearQueue: () => void;
  removeFromQueue: (messageId: string) => void;
  isQueueEmpty: boolean;
  nextMessage: QueuedMessage | null;
}

export function useMessageQueue({
  onProcessMessage,
  isProcessing,
}: UseMessageQueueOptions): UseMessageQueueReturn {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const processingRef = useRef(false);
  const isProcessingRef = useRef(isProcessing);
  const hasProcessedRef = useRef<Set<string>>(new Set());

  // Update ref when isProcessing changes
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  const addToQueue = useCallback(
    (message: string, images: Id<"_storage">[]) => {
      const queuedMessage: QueuedMessage = {
        id: crypto.randomUUID(),
        message,
        images,
        timestamp: Date.now(),
      };

      setQueue((prevQueue) => [...prevQueue, queuedMessage]);
    },
    [],
  );

  const removeFromQueue = useCallback((messageId: string) => {
    setQueue((prevQueue) => prevQueue.filter((msg) => msg.id !== messageId));
    hasProcessedRef.current.delete(messageId);
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    hasProcessedRef.current.clear();
  }, []);

  const processNextMessage = useCallback(async () => {
    if (processingRef.current || isProcessingRef.current) {
      return;
    }

    setQueue((currentQueue) => {
      if (currentQueue.length === 0) {
        return currentQueue;
      }

      const [nextMessage, ...remainingQueue] = currentQueue;

      // Check if we've already processed this message
      if (hasProcessedRef.current.has(nextMessage.id)) {
        return remainingQueue;
      }

      // Mark as processed immediately to prevent double processing
      hasProcessedRef.current.add(nextMessage.id);

      // Process the message asynchronously
      (async () => {
        processingRef.current = true;
        try {
          await onProcessMessage(nextMessage.message, nextMessage.images);
        } catch (error) {
          console.error("Failed to process queued message:", error);
          // Remove from processed set on error so it could be retried
          hasProcessedRef.current.delete(nextMessage.id);
        } finally {
          processingRef.current = false;
          // After processing, check if there are more messages to process
          // Use a longer delay to ensure the AI has fully started processing
          setTimeout(() => {
            if (!isProcessingRef.current && queue.length > 0) {
              processNextMessage();
            }
          }, 500);
        }
      })();

      return remainingQueue;
    });
  }, [onProcessMessage]);

  // Process queue when AI stops processing
  useEffect(() => {
    if (!isProcessing && !processingRef.current && queue.length > 0) {
      // Add a small delay to prevent race conditions
      const timer = setTimeout(() => {
        processNextMessage();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isProcessing, processNextMessage, queue.length]);

  const nextMessage = queue.length > 0 ? queue[0] : null;
  const isQueueEmpty = queue.length === 0;

  return {
    queue,
    addToQueue,
    clearQueue,
    removeFromQueue,
    isQueueEmpty,
    nextMessage,
  };
}
