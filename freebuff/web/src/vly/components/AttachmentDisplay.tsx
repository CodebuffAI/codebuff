"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { File, Download, FileText } from "lucide-react";

interface AttachmentDisplayProps {
  attachments: Id<"_storage">[];
}

export default function AttachmentDisplay({
  attachments,
}: AttachmentDisplayProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {attachments.map((fileId) => (
        <AttachmentItem key={fileId} fileId={fileId} />
      ))}
    </div>
  );
}

function AttachmentItem({ fileId }: { fileId: Id<"_storage"> }) {
  const fileData = useQuery(api.tickets_messages.getFileUrl, {
    storageId: fileId,
  });
  const [imageError, setImageError] = useState(false);

  if (!fileData) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2">
        <File className="h-4 w-4" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  // Check if it's an image based on content type
  const isImage = fileData.contentType?.startsWith("image/");

  if (isImage && !imageError) {
    return (
      <div className="mt-2 max-w-md overflow-hidden rounded-lg border bg-muted/30">
        <img
          src={fileData.url}
          alt="Attachment"
          className="h-auto max-h-96 w-full cursor-pointer object-contain transition-opacity hover:opacity-90"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // Fallback: non-image or failed to render as image
  return (
    <a
      href={fileData.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 rounded-md bg-muted/50 p-2 transition-colors hover:bg-muted"
    >
      <FileText className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate text-sm">Download attachment</span>
      <Download className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}
