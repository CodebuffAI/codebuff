import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/vly/components/ui/button";
import { Paperclip, X, Loader2, File } from "lucide-react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

interface FileUploadProps {
  onFilesChange: (fileIds: Id<"_storage">[]) => void;
  files: Id<"_storage">[];
}

export default function FileUpload({ onFilesChange, files }: FileUploadProps) {
  const generateUploadUrl = useMutation(api.tickets.generateUploadUrl);
  const [uploading, setUploading] = useState(false);
  const [fileNames, setFileNames] = useState<Record<string, string>>({});

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    try {
      const uploadedIds: Id<"_storage">[] = [];
      const names: Record<string, string> = { ...fileNames };

      for (const file of Array.from(selectedFiles)) {
        // Generate upload URL
        const uploadUrl = await generateUploadUrl();

        // Upload the file
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        const { storageId } = await result.json();
        uploadedIds.push(storageId);
        names[storageId] = file.name;
      }

      setFileNames(names);
      onFilesChange([...files, ...uploadedIds]);
      toast.success(`${selectedFiles.length} file(s) uploaded`);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload files");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveFile = (fileId: Id<"_storage">) => {
    const newFiles = files.filter((id) => id !== fileId);
    onFilesChange(newFiles);
    const newNames = { ...fileNames };
    delete newNames[fileId];
    setFileNames(newNames);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="file"
          id="file-upload"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => document.getElementById("file-upload")?.click()}
          disabled={uploading}
          className="w-full"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Paperclip className="mr-2 h-4 w-4" />
              Attach Files
            </>
          )}
        </Button>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((fileId) => (
            <div
              key={fileId}
              className="flex items-center justify-between rounded-md bg-muted p-2"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <File className="h-4 w-4 flex-shrink-0" />
                <span className="truncate text-sm">
                  {fileNames[fileId] || "Uploaded file"}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveFile(fileId)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
