"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { useAssetsCache, invalidateAssetsCache } from "@/hooks/useAssetsCache";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Edit,
  FileImage,
  FileText,
  Loader,
  Plus,
  Trash2,
  Upload,
  X,
  Image as ImageIcon,
  File,
  MoreHorizontal,
  Download,
  Eye,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AssetMetadata {
  id: string;
  fileName: string;
  originalName: string;
  description?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  filePath: string;
}

interface AssetsViewProps {
  semanticIdentifier: string;
}

function AssetsView({ semanticIdentifier }: AssetsViewProps) {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [justUploaded, setJustUploaded] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [deleteDialogAsset, setDeleteDialogAsset] =
    useState<AssetMetadata | null>(null);
  const [previewModal, setPreviewModal] = useState<{
    asset: AssetMetadata;
    content: string | null;
    contentType: string;
    isTextPreview: boolean;
    canPreview: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { assets, isLoading, refreshAssets } =
    useAssetsCache(semanticIdentifier);
  const uploadAsset = useAction(api.assets.uploadAsset);
  const deleteAsset = useAction(api.assets.deleteAsset);
  const updateAsset = useAction(api.assets.updateAsset);
  const downloadAsset = useAction(api.assets.downloadAsset);
  const previewAsset = useAction(api.assets.previewAsset);

  const validateFile = (file: File): boolean => {
    // Check size first - reject immediately
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size must be less than 5MB");
      return false;
    }

    const codeExtensions = [
      ".js",
      ".ts",
      ".tsx",
      ".jsx",
      ".py",
      ".java",
      ".cpp",
      ".c",
      ".php",
      ".rb",
      ".go",
      ".rs",
      ".swift",
      ".kt",
      ".scala",
      ".css",
      ".scss",
      ".less",
      ".html",
      ".htm",
      ".xml",
      ".json",
      ".yaml",
      ".yml",
    ];

    const fileName = file.name.toLowerCase();
    const isCodeFile = codeExtensions.some((ext) => fileName.endsWith(ext));

    if (isCodeFile) {
      toast.error(
        "Code files not allowed. Upload images, documents, or media files.",
      );
      return false;
    }

    return true;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !validateFile(file)) {
      if (event.target) event.target.value = "";
      return;
    }

    setSelectedFile(file);
    setJustUploaded(false);

    if (file.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      setFilePreview(previewUrl);
    } else {
      setFilePreview(null);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (!file || !validateFile(file)) return;

    setSelectedFile(file);
    setJustUploaded(false);

    if (file.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      setFilePreview(previewUrl);
    } else {
      setFilePreview(null);
    }
  };

  const clearUploadForm = () => {
    setSelectedFile(null);
    setDescription("");
    setJustUploaded(false);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview]);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      const base64Data = base64Content.split(",")[1];

      await uploadAsset({
        semanticIdentifier,
        fileName: selectedFile.name,
        originalName: selectedFile.name,
        fileContent: base64Data,
        description: description || undefined,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
      });

      toast.success(`"${selectedFile.name}" uploaded successfully!`);
      setJustUploaded(true);

      clearUploadForm();

      // Invalidate cache to trigger refresh across all components
      invalidateAssetsCache(semanticIdentifier);
      refreshAssets();

      setTimeout(() => {
        setJustUploaded(false);
      }, 3000);
    } catch (error) {
      console.error("Failed to upload asset:", error);
      toast.error("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAsset = async (fileName: string) => {
    try {
      await deleteAsset({ semanticIdentifier, fileName });
      toast.success(`"${fileName}" deleted successfully!`);
      setDeleteDialogAsset(null);

      // Invalidate cache to trigger refresh across all components
      invalidateAssetsCache(semanticIdentifier);
      refreshAssets();
    } catch (error) {
      console.error("Failed to delete asset:", error);
      toast.error("Delete failed. Please try again.");
    }
  };

  const handleUpdateAsset = async (
    fileName: string,
    newFileName: string,
    description: string,
  ) => {
    try {
      await updateAsset({
        semanticIdentifier,
        fileName,
        newFileName: newFileName !== fileName ? newFileName : undefined,
        description,
      });

      const actionText = newFileName !== fileName ? "renamed" : "updated";
      toast.success(`Asset ${actionText} successfully!`);

      // Invalidate cache to trigger refresh across all components
      invalidateAssetsCache(semanticIdentifier);
      refreshAssets();
    } catch (error) {
      console.error("Failed to update asset:", error);
      toast.error("Update failed. Please try again.");
    }
  };

  const handleDownloadAsset = async (fileName: string) => {
    try {
      toast.loading("Preparing download...");
      const result = await downloadAsset({
        semanticIdentifier,
        fileName,
      });

      if (result.success) {
        // Convert base64 to blob and trigger download
        const byteCharacters = atob(result.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: result.contentType });

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.dismiss();
        toast.success(`Downloaded ${fileName}`);
      }
    } catch (error) {
      toast.dismiss();
      console.error("Failed to download asset:", error);
      toast.error("Download failed. Please try again.");
    }
  };

  const handlePreviewAsset = async (asset: AssetMetadata) => {
    try {
      toast.loading("Loading preview...");
      const result = await previewAsset({
        semanticIdentifier,
        fileName: asset.fileName,
      });

      toast.dismiss();

      if (result.success) {
        setPreviewModal({
          asset,
          content: result.previewContent,
          contentType: result.contentType,
          isTextPreview: result.isTextPreview,
          canPreview: result.canPreview,
        });

        if (!result.canPreview) {
          toast.error("Preview not available for this file type or size");
        }
      }
    } catch (error) {
      toast.dismiss();
      console.error("Failed to preview asset:", error);
      toast.error("Preview failed. Please try again.");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileIcon = (fileType: string, size: number = 16) => {
    if (fileType.startsWith("image/"))
      return <ImageIcon size={size} className="text-blue-500" />;
    if (fileType === "application/pdf")
      return <FileText size={size} className="text-red-500" />;
    if (fileType.startsWith("text/"))
      return <FileText size={size} className="text-gray-500" />;
    return <File size={size} className="text-gray-500" />;
  };

  return (
    <div className="relative h-full overflow-y-auto px-6 py-4 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-800">Assets</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage your project assets ({assets.length}{" "}
            {assets.length === 1 ? "file" : "files"})
          </p>
        </div>
      </div>

      {/* Main Content - Side by side on large screens, stacked on small */}
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8 xl:gap-10">
        {/* Upload Area - Fixed width on large screens */}
        <div className="w-full lg:w-[380px] lg:flex-shrink-0 xl:w-[420px]">
          <motion.div
            className={`h-fit rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 ${
              justUploaded
                ? "border-green-400 bg-green-50/50"
                : dragActive
                  ? "border-purple-500 bg-purple-50/50"
                  : "border-zinc-300 bg-white/30 backdrop-blur-sm hover:bg-purple-50/20"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.txt,.md,.svg,.webp,.ico,.zip,.rar,.mp4,.mp3,.wav,.avi"
            />

            <AnimatePresence mode="wait">
              {justUploaded ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="space-y-3"
                >
                  <Check className="mx-auto h-10 w-10 text-green-500" />
                  <p className="font-medium text-green-700">
                    Upload successful!
                  </p>
                  <Button
                    onClick={() => setJustUploaded(false)}
                    variant="outline"
                    size="sm"
                    className="border-green-500 text-green-700 hover:bg-green-50"
                  >
                    Upload Another File
                  </Button>
                </motion.div>
              ) : selectedFile ? (
                <motion.div
                  key="file-selected"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-center gap-3 rounded-lg border bg-zinc-50 p-3">
                    {filePreview ? (
                      filePreview && (
                        <div className="relative">
                          <img
                            src={filePreview}
                            alt={selectedFile.name}
                            className="h-16 w-16 rounded border object-cover"
                          />
                        </div>
                      )
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded bg-zinc-100">
                        {getFileIcon(selectedFile.type, 24)}
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-zinc-800">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearUploadForm}
                      className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="text-left">
                      <Label className="text-xs text-zinc-600">
                        Description (optional)
                      </Label>
                      <Input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Brief description..."
                        className="mt-1 h-8 bg-white/60 text-xs"
                      />
                    </div>
                    <Button
                      onClick={handleUpload}
                      disabled={isUploading}
                      size="sm"
                      className="w-full"
                    >
                      {isUploading ? (
                        <Loader className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-3 w-3" />
                      )}
                      {isUploading ? "Uploading..." : "Upload File"}
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-4"
                >
                  <Upload
                    className={`mx-auto h-10 w-10 transition-colors ${
                      dragActive ? "text-purple-500" : "text-zinc-400"
                    }`}
                  />
                  <div>
                    <p
                      className={`font-medium transition-colors ${
                        dragActive ? "text-purple-700" : "text-zinc-800"
                      }`}
                    >
                      {dragActive
                        ? "Drop files here"
                        : "Drop files here or click to browse"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Images, documents, media files only (max 5MB)
                    </p>
                  </div>
                  {!dragActive && (
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      size="sm"
                      className="mx-auto"
                    >
                      <Plus className="mr-2 h-3 w-3" />
                      Choose File
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Assets Table - Flexible width on large screens */}
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white/40 p-12 backdrop-blur-sm">
              <Loader className="h-5 w-5 animate-spin text-zinc-400" />
              <span className="ml-2 text-sm text-zinc-600">
                Loading assets...
              </span>
            </div>
          ) : assets.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg border border-zinc-200 bg-white/40 py-16 text-center text-zinc-500 backdrop-blur-sm lg:py-20"
            >
              <FileImage className="mx-auto mb-3 h-12 w-12 text-zinc-300" />
              <p className="text-sm font-medium">No assets yet</p>
              <p className="mt-1 text-xs text-zinc-400">
                Upload your first asset to get started
              </p>
            </motion.div>
          ) : (
            <motion.div
              className="overflow-x-auto rounded-lg border border-zinc-200 bg-white/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Table with minimum width for proper display */}
              <div className="min-w-[600px]">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 border-b border-zinc-200 bg-zinc-50/50 px-4 py-3 text-xs font-medium text-zinc-600">
                  <div className="col-span-5">Name</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-2">Size</div>
                  <div className="col-span-2">Modified</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-zinc-100">
                  {assets.map((asset, index) => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      onUpdate={handleUpdateAsset}
                      onDelete={(fileName) => {
                        const assetToDelete = assets.find(
                          (a) => a.fileName === fileName,
                        );
                        if (assetToDelete) {
                          setDeleteDialogAsset(assetToDelete);
                        }
                      }}
                      onDownload={handleDownloadAsset}
                      onPreview={handlePreviewAsset}
                      index={index}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Global Delete Confirmation Dialog - Portal to document.body */}
      {deleteDialogAsset &&
        typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center bg-black/50"
              style={{ zIndex: 9999 }}
              onClick={() => setDeleteDialogAsset(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="mx-4 max-w-sm rounded-lg bg-white p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="mb-2 text-lg font-semibold text-zinc-800">
                  Delete Asset
                </h3>
                <p className="mb-4 text-sm text-zinc-600">
                  Are you sure you want to delete "{deleteDialogAsset.fileName}
                  "? This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteDialogAsset(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      handleDeleteAsset(deleteDialogAsset.fileName)
                    }
                  >
                    Delete
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}

      {/* Preview Modal */}
      {previewModal && (
        <Dialog
          open={!!previewModal}
          onOpenChange={() => setPreviewModal(null)}
        >
          <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-hidden sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  {getFileIcon(previewModal.contentType, 20)}
                </div>
                <span className="truncate">{previewModal.asset.fileName}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleDownloadAsset(previewModal.asset.fileName)
                  }
                  className="ml-auto mr-5 flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 overflow-auto">
              {!previewModal.canPreview ? (
                <div className="flex h-64 items-center justify-center text-center">
                  <div>
                    <File className="mx-auto mb-2 h-12 w-12 text-zinc-400" />
                    <p className="text-sm font-medium text-zinc-600">
                      Preview not available
                    </p>
                    <p className="text-xs text-zinc-500">
                      File is too large or type not supported for preview
                    </p>
                  </div>
                </div>
              ) : previewModal.isTextPreview ? (
                <div className="rounded border bg-zinc-50 p-4">
                  <pre className="whitespace-pre-wrap text-sm">
                    {previewModal.content}
                  </pre>
                </div>
              ) : previewModal.contentType.startsWith("image/") ? (
                <div className="flex justify-center">
                  <img
                    src={`data:${previewModal.contentType};base64,${previewModal.content}`}
                    alt={previewModal.asset.fileName}
                    className="max-h-[60vh] max-w-full rounded border object-contain"
                  />
                </div>
              ) : previewModal.contentType === "application/pdf" ? (
                <div className="flex justify-center">
                  <iframe
                    src={`data:${previewModal.contentType};base64,${previewModal.content}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                    className="h-[60vh] w-full rounded border"
                    title={previewModal.asset.fileName}
                  />
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-center">
                  <div>
                    <File className="mx-auto mb-2 h-12 w-12 text-zinc-400" />
                    <p className="text-sm font-medium text-zinc-600">
                      Preview not supported
                    </p>
                    <p className="text-xs text-zinc-500">
                      This file type cannot be previewed
                    </p>
                  </div>
                </div>
              )}
            </div>

            {previewModal.asset.description && (
              <div className="mt-4 rounded border-l-4 border-blue-400 bg-blue-50 p-3">
                <p className="text-sm text-blue-800">
                  <span className="font-medium">Description: </span>
                  {previewModal.asset.description}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface AssetRowProps {
  asset: AssetMetadata;
  onUpdate: (
    fileName: string,
    newFileName: string,
    description: string,
  ) => void;
  onDelete: (fileName: string) => void;
  onDownload: (fileName: string) => void;
  onPreview: (asset: AssetMetadata) => void;
  index: number;
}

function AssetRow({
  asset,
  onUpdate,
  onDelete,
  onDownload,
  onPreview,
  index,
}: AssetRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedFileName, setEditedFileName] = useState(asset.fileName);
  const [editedDescription, setEditedDescription] = useState(
    asset.description || "",
  );

  const handleSave = () => {
    if (
      editedFileName.trim() !== asset.fileName ||
      editedDescription !== asset.description
    ) {
      onUpdate(asset.fileName, editedFileName.trim(), editedDescription);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedFileName(asset.fileName);
    setEditedDescription(asset.description || "");
    setIsEditing(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/"))
      return <ImageIcon className="h-4 w-4 text-blue-500" />;
    if (fileType === "application/pdf")
      return <FileText className="h-4 w-4 text-red-500" />;
    if (fileType.startsWith("text/"))
      return <FileText className="h-4 w-4 text-gray-500" />;
    return <File className="h-4 w-4 text-gray-500" />;
  };

  const getFileTypeLabel = (fileType: string) => {
    if (fileType.startsWith("image/")) return "Image";
    if (fileType === "application/pdf") return "PDF";
    if (fileType.startsWith("text/")) return "Text";
    return "File";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group grid grid-cols-12 gap-4 px-4 py-3 transition-colors hover:bg-zinc-50/50"
    >
      {/* Name Column */}
      <div className="col-span-5 flex min-w-0 items-center gap-3">
        <div className="flex-shrink-0">{getFileIcon(asset.fileType)}</div>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="space-y-1">
              <Input
                value={editedFileName}
                onChange={(e) => setEditedFileName(e.target.value)}
                className="h-6 border-zinc-300 bg-white text-xs"
                autoFocus
              />
              <Input
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Description..."
                className="h-6 border-zinc-300 bg-white text-xs"
              />
            </div>
          ) : (
            <div>
              <p
                className="cursor-pointer truncate text-sm font-medium text-zinc-900 transition-colors hover:text-blue-600"
                onClick={() => onPreview(asset)}
                title="Click to preview"
              >
                {asset.fileName}
              </p>
              {asset.description && (
                <p className="truncate text-xs text-zinc-500">
                  {asset.description}
                </p>
              )}
              <p className="text-xs text-zinc-400">@{asset.fileName}</p>
            </div>
          )}
        </div>
      </div>

      {/* Type Column */}
      <div className="col-span-2 flex items-center">
        <span className="text-xs text-zinc-600">
          {getFileTypeLabel(asset.fileType)}
        </span>
      </div>

      {/* Size Column */}
      <div className="col-span-2 flex items-center">
        <span className="text-xs text-zinc-600">
          {formatFileSize(asset.fileSize)}
        </span>
      </div>

      {/* Modified Column */}
      <div className="col-span-2 flex items-center">
        <span className="text-xs text-zinc-500">
          {new Date(asset.uploadedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Actions Column */}
      <div className="col-span-1 flex items-center justify-end">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              className="h-6 w-6 p-0 hover:bg-green-100 hover:text-green-600"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 transition-opacity hover:bg-zinc-100 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem
                onClick={() => onPreview(asset)}
                className="cursor-pointer text-xs"
              >
                <Eye className="mr-2 h-3 w-3" />
                Preview
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDownload(asset.fileName)}
                className="cursor-pointer text-xs"
              >
                <Download className="mr-2 h-3 w-3" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsEditing(true)}
                className="cursor-pointer text-xs"
              >
                <Edit className="mr-2 h-3 w-3" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(asset.fileName)}
                className="cursor-pointer text-xs text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </motion.div>
  );
}

export default AssetsView;
