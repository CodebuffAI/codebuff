"use node";

import { v } from "convex/values";
import { z } from "zod";
import { initializeCodebase } from "../codebase-utils/codebase/initializeCodebase";
import { action } from "./_generated/server";
import { getVerifiedAccessProject } from "./project";
import { getAuthUser } from "./users";
import {
  Codebase,
  isVercelDeployable,
} from "../codebase-utils/codebase/Codebase";
import { DaytonaCodebase } from "../codebase-utils/codebase/DaytonaCodebase";

// Zod schema for asset metadata validation
const AssetMetadataSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  originalName: z.string(),
  description: z.string().optional(),
  fileType: z.string(),
  fileSize: z.number(),
  uploadedAt: z.string(),
  filePath: z.string(),
});

const AssetsCollectionSchema = z.object({
  assets: z.array(AssetMetadataSchema),
  lastUpdated: z.string(),
});

export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;
type AssetsCollection = z.infer<typeof AssetsCollectionSchema>;

// 16 MiB limit for Convex functions (leaving some margin)
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MiB
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/svg+xml",
  "image/webp",
]);
const ALLOWED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
  ".webp",
];

// Helper function to read/write assets metadata JSON outside codebase
class AssetsManager {
  constructor(private codebase: Codebase) {
    if (!isVercelDeployable(codebase)) {
      throw new Error("Codebase does not support deployment");
    }
  }

  async readAssetsMetadata(): Promise<AssetsCollection> {
    try {
      const jsonContent = await this.codebase.readFile("../assets.json");
      const parsed = JSON.parse(jsonContent);
      return AssetsCollectionSchema.parse(parsed);
    } catch {
      // Return empty collection if file doesn't exist or is invalid
      return {
        assets: [],
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  async writeAssetsMetadata(collection: AssetsCollection): Promise<void> {
    const jsonContent = JSON.stringify(collection, null, 2);
    const uint8Array = new Uint8Array(Buffer.from(jsonContent, "utf-8"));
    await this.codebase.writeBinaryFile("../assets.json", uint8Array);
  }
}

// Special function to provide assets context to AI (reads from assets.json)
export const getAssetsContext = action({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or no sandbox associated");
    }

    try {
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );
      const assetsManager = new AssetsManager(codebase);
      const assetsCollection = await assetsManager.readAssetsMetadata();

      if (assetsCollection.assets.length === 0) {
        return `# Project Assets Context

No assets have been uploaded to this project yet.

## Available Assets: None

## How to Reference Assets:
- Upload assets through the assets panel
- All assets will be located in \`public/assets/\` directory
- Reference them directly by filename in your code

## Asset Guidelines:
- Images: Use for UI elements, logos, backgrounds, icons
- Documents: Reference for downloadable content  
- Media files: Use for embedded content

*Upload assets to get started.*`;
      }

      return `# Project Assets Context

This context is automatically generated from uploaded assets.

## Available Assets (${assetsCollection.assets.length} total):

${assetsCollection.assets
  .map(
    (asset) => `
### ${asset.fileName}
- **Type**: ${asset.fileType}
- **Size**: ${Math.round(asset.fileSize / 1024)}KB
- **Description**: ${asset.description || `${asset.fileType} asset`}
- **Location**: \`public/assets/${asset.fileName}\`
- **Usage**: Reference as \`"${asset.fileName}"\` in code
${asset.description ? `- **Context**: ${asset.description}` : ""}
`,
  )
  .join("\n")}

## How to Reference Assets:
- All assets are located in \`public/assets/\` directory
- Reference them directly by filename: "${assetsCollection.assets[0]?.fileName || "filename.ext"}"
- Assets are automatically optimized and available for use in components

## Asset Guidelines:
- Images: Use for UI elements, logos, backgrounds, icons
- Documents: Reference for downloadable content
- Media files: Use for embedded content

*This context is automatically generated from assets metadata.*`;
    } catch (error) {
      console.error("Error getting assets context:", error);
      return "No assets context available.";
    }
  },
});

// Upload asset to project codebase - stores actual files
export const uploadAsset = action({
  args: {
    semanticIdentifier: v.string(),
    fileName: v.string(),
    originalName: v.string(),
    fileContent: v.string(), // base64 encoded content
    description: v.optional(v.string()),
    fileType: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    console.log("Starting asset upload for:", args.fileName);

    // Validate file size
    if (args.fileSize > MAX_FILE_SIZE) {
      throw new Error(
        `File size ${Math.round(args.fileSize / 1024 / 1024)}MB exceeds the maximum limit of ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
      );
    }

    const normalizedName = args.originalName.toLowerCase();
    const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some((ext) =>
      normalizedName.endsWith(ext),
    );
    const hasAllowedMimeType = ALLOWED_IMAGE_MIME_TYPES.has(args.fileType);

    if (!hasAllowedExtension || !hasAllowedMimeType) {
      throw new Error(
        "Only image files are allowed: .jpg, .jpeg, .png, .gif, .svg, .webp",
      );
    }

    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or no sandbox associated");
    }

    try {
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );
      const assetsManager = new AssetsManager(codebase);

      // Use original filename, cleaned of unsafe characters
      const safeName = args.originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `public/assets/${safeName}`;

      console.log("Writing asset file to:", filePath);

      // Decode base64 content and write as binary (unified approach)
      const fileBuffer = Buffer.from(args.fileContent, "base64");
      const uint8Array = new Uint8Array(fileBuffer);
      await codebase.writeBinaryFile(filePath, uint8Array);

      // Read existing assets metadata
      const assetsCollection = await assetsManager.readAssetsMetadata();

      // Create new asset metadata
      const newAsset: AssetMetadata = {
        id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fileName: safeName,
        originalName: args.originalName,
        description: args.description,
        fileType: args.fileType,
        fileSize: args.fileSize,
        uploadedAt: new Date().toISOString(),
        filePath: filePath,
      };

      // Remove any existing asset with the same filename and add new one
      const updatedAssets = assetsCollection.assets.filter(
        (asset) => asset.fileName !== safeName,
      );
      updatedAssets.push(newAsset);

      // Update metadata collection
      const updatedCollection: AssetsCollection = {
        assets: updatedAssets,
        lastUpdated: new Date().toISOString(),
      };

      // Write updated metadata to assets.json (outside codebase)
      await assetsManager.writeAssetsMetadata(updatedCollection);

      console.log("Asset upload completed successfully");
      return { success: true, asset: newAsset };
    } catch (error) {
      console.error("Error uploading asset:", error);
      throw new Error(
        `Failed to upload asset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// Get all assets from project - scans actual files in public/assets/ directory
export const getAssets = action({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or no sandbox associated");
    }

    try {
      let codebase;
      try {
        codebase = await initializeCodebase(
          project.sandbox_id,
          project.packageManager,
        );
      } catch (shellError) {
        console.error("Failed to initialize project codebase:", shellError);
        // Return empty array instead of throwing - this prevents UI errors
        console.log(
          "Returning empty assets array due to shell connection issue",
        );
        return [];
      }

      const assetsManager = new AssetsManager(codebase);
      let metadata: AssetsCollection;
      try {
        metadata = await assetsManager.readAssetsMetadata();
      } catch {
        metadata = { assets: [], lastUpdated: new Date().toISOString() };
      }

      // Fast path: assets.json is the source of truth for uploads managed by VLY.
      // Avoid forcing a filesystem refresh and downloading every asset just to
      // reconstruct metadata we already have.
      if (metadata.assets.length > 0) {
        return metadata.assets.map((asset) => ({
          ...asset,
          filePath: asset.filePath || `public/assets/${asset.fileName}`,
        }));
      }

      // Fallback for legacy/external assets when metadata is missing.
      const allFiles = await codebase.getAllFilePaths();
      const assetFiles = allFiles.filter((path) =>
        path.startsWith("public/assets/"),
      );

      if (assetFiles.length === 0) {
        return [];
      }

      const inferFileType = (fileName: string) => {
        const ext = fileName.split(".").pop()?.toLowerCase();
        if (!ext) return "unknown";
        if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
          return `image/${ext}`;
        }
        if (ext === "pdf") return "application/pdf";
        if (ext === "txt") return "text/plain";
        if (ext === "json") return "application/json";
        return `application/${ext}`;
      };

      const assets: AssetMetadata[] = assetFiles.map((filePath) => {
        const fileName = filePath.replace("public/assets/", "");
        return {
          id: `asset_${fileName}`,
          fileName,
          originalName: fileName,
          description: undefined,
          fileType: inferFileType(fileName),
          fileSize: 0,
          uploadedAt: metadata.lastUpdated,
          filePath,
        };
      });

      console.log(
        `Successfully loaded ${assets.length} assets using lightweight metadata lookup`,
      );
      return assets;
    } catch (error) {
      console.error("Error getting assets:", error);
      // Return empty array instead of throwing to prevent UI crashes
      return [];
    }
  },
});

// Delete asset from project
export const deleteAsset = action({
  args: {
    semanticIdentifier: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or no sandbox associated");
    }

    try {
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );
      const assetsManager = new AssetsManager(codebase);

      // First, check if the file actually exists in the filesystem
      const filePath = `public/assets/${args.fileName}`;
      const fileExists = await (
        codebase as DaytonaCodebase
      ).checkIfFileExistsInCodebase(filePath);

      if (!fileExists) {
        throw new Error("Asset file not found in filesystem");
      }

      // Read existing assets metadata
      let assetsCollection: AssetsCollection;
      try {
        assetsCollection = await assetsManager.readAssetsMetadata();
      } catch {
        // If no metadata file, create empty metadata
        assetsCollection = {
          assets: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // Find the asset in metadata (if it exists there)
      const assetIndex = assetsCollection.assets.findIndex(
        (asset) => asset.fileName === args.fileName,
      );

      // Remove from metadata if it exists there
      if (assetIndex !== -1) {
        assetsCollection.assets.splice(assetIndex, 1);
        assetsCollection.lastUpdated = new Date().toISOString();

        // Write updated metadata to assets.json (outside codebase)
        await assetsManager.writeAssetsMetadata(assetsCollection);
      }

      // Remove the actual file using the filesystem API
      try {
        await codebase.deleteFile(filePath);
        console.log(`Successfully deleted file: ${filePath}`);
      } catch (e) {
        console.error("Failed to delete file:", e);
        throw new Error(
          `Failed to delete asset file: ${String(e).substring(0, 100)}`,
        );
      }

      // Verify the file is actually gone
      const stillExists = await codebase.checkIfFileExists(filePath);
      if (stillExists) {
        throw new Error(
          "File deletion failed - file still exists after deletion attempt",
        );
      }

      return { success: true };
    } catch (error) {
      console.error("Error deleting asset:", error);
      throw new Error(
        `Failed to delete asset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// Helper action to refresh chat assets - called by UI components
export const refreshChatAssets = action({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async () => {
    // This is just a trigger action that UI components can call
    // The actual refresh happens in the UI via the global refresh function
    return { success: true };
  },
});

// Update asset metadata (including renaming)
export const updateAsset = action({
  args: {
    semanticIdentifier: v.string(),
    fileName: v.string(),
    newFileName: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or no sandbox associated");
    }

    try {
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );
      const assetsManager = new AssetsManager(codebase);

      // First, check if the file actually exists in the filesystem
      const filePath = `public/assets/${args.fileName}`;
      const fileExists = await codebase.checkIfFileExists(filePath);

      if (!fileExists) {
        throw new Error("Asset file not found in filesystem");
      }

      // Read existing assets metadata
      let assetsCollection: AssetsCollection;
      try {
        assetsCollection = await assetsManager.readAssetsMetadata();
      } catch {
        // If no metadata file, create empty metadata
        assetsCollection = {
          assets: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // Find the asset in metadata (if it exists there) or create new entry
      let assetIndex = assetsCollection.assets.findIndex(
        (asset) => asset.fileName === args.fileName,
      );

      let asset: AssetMetadata;
      if (assetIndex === -1) {
        // Asset not in metadata, create new entry
        asset = {
          id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          fileName: args.fileName,
          originalName: args.fileName,
          description: undefined,
          fileType: "unknown", // Will be determined by extension
          fileSize: 0, // Will be updated if needed
          uploadedAt: new Date().toISOString(),
          filePath: filePath,
        };
        assetsCollection.assets.push(asset);
        assetIndex = assetsCollection.assets.length - 1;
      } else {
        asset = assetsCollection.assets[assetIndex];
      }

      const oldFilePath = asset.filePath;

      // Update metadata
      if (args.description !== undefined) {
        asset.description = args.description;
      }

      if (args.newFileName && args.newFileName !== args.fileName) {
        const safeNewName = args.newFileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const newFilePath = `public/assets/${safeNewName}`;

        // Rename the actual file
        try {
          await codebase.runCommandThrow(
            `mv "${oldFilePath}" "${newFilePath}"`,
            5000,
            undefined,
          );
          console.log(
            `Successfully renamed file: ${oldFilePath} -> ${newFilePath}`,
          );

          asset.fileName = safeNewName;
          asset.filePath = newFilePath;

          // Refresh the file paths cache after rename
          try {
            await codebase.refreshFilePaths();
          } catch (refreshError) {
            console.warn(
              "Failed to refresh file paths cache after rename:",
              refreshError,
            );
          }
        } catch (e) {
          console.log("File rename failed:", String(e).substring(0, 100));
          // Continue with metadata update even if file rename failed
        }
      }

      // Update timestamp
      assetsCollection.lastUpdated = new Date().toISOString();

      // Write updated metadata to assets.json (outside codebase)
      await assetsManager.writeAssetsMetadata(assetsCollection);

      return { success: true, asset };
    } catch (error) {
      console.error("Error updating asset:", error);
      throw new Error(
        `Failed to update asset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// Action to download asset content
export const downloadAsset = action({
  args: {
    semanticIdentifier: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or no sandbox associated");
    }

    try {
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );
      const filePath = `public/assets/${args.fileName}`;

      // Check if file exists
      const fileExists = await (
        codebase as DaytonaCodebase
      ).checkIfFileExistsInCodebase(filePath);
      if (!fileExists) {
        throw new Error("Asset file not found: " + filePath);
      }

      // Read file as bytes
      const fileContent = await codebase.readFile(filePath);
      // Get metadata for content type
      const assetsManager = new AssetsManager(codebase);
      let metadata: AssetsCollection;
      try {
        metadata = await assetsManager.readAssetsMetadata();
      } catch {
        metadata = { assets: [], lastUpdated: new Date().toISOString() };
      }

      const assetMetadata = metadata.assets.find(
        (asset) => asset.fileName === args.fileName,
      );

      // Determine content type from file extension if metadata not available
      let contentType = assetMetadata?.fileType || "application/octet-stream";
      if (!assetMetadata) {
        const ext = args.fileName.split(".").pop()?.toLowerCase();
        if (ext) {
          if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
            contentType = `image/${ext}`;
          } else if (["pdf"].includes(ext)) {
            contentType = "application/pdf";
          } else if (["txt"].includes(ext)) {
            contentType = "text/plain";
          } else if (["json"].includes(ext)) {
            contentType = "application/json";
          }
        }
      }

      return {
        success: true,
        fileName: args.fileName,
        content: fileContent,
        contentType,
        size: fileContent.length,
      };
    } catch (error) {
      console.error("Error downloading asset:", error);
      throw new Error(
        `Failed to download asset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

// Action to get asset content for preview
export const previewAsset = action({
  args: {
    semanticIdentifier: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project || !project.sandbox_id) {
      throw new Error("Project not found or no sandbox associated");
    }

    try {
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );
      const filePath = `public/assets/${args.fileName}`;

      // Check if file exists
      const fileExists = await (
        codebase as DaytonaCodebase
      ).checkIfFileExistsInCodebase(filePath);
      if (!fileExists) {
        throw new Error("Asset file not found: " + filePath);
      }

      // Get metadata
      const assetsManager = new AssetsManager(codebase);
      let metadata: AssetsCollection;
      try {
        metadata = await assetsManager.readAssetsMetadata();
      } catch {
        metadata = { assets: [], lastUpdated: new Date().toISOString() };
      }

      const assetMetadata = metadata.assets.find(
        (asset) => asset.fileName === args.fileName,
      );

      // Determine content type from file extension if metadata not available
      let contentType = assetMetadata?.fileType || "application/octet-stream";
      if (!assetMetadata) {
        const ext = args.fileName.split(".").pop()?.toLowerCase();
        if (ext) {
          if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
            contentType = `image/${ext}`;
          } else if (["pdf"].includes(ext)) {
            contentType = "application/pdf";
          } else if (["txt"].includes(ext)) {
            contentType = "text/plain";
          } else if (["json"].includes(ext)) {
            contentType = "application/json";
          }
        }
      }

      // For preview, we only read certain file types and limit size
      const MAX_PREVIEW_SIZE = 5 * 1024 * 1024; // 5MB limit for preview

      let previewContent: string | null = null;
      let isTextPreview = false;

      if (
        contentType.startsWith("text/") ||
        contentType === "application/json"
      ) {
        // For text files, read as text
        const textContent = await codebase.readFile(filePath);
        if (textContent.length <= MAX_PREVIEW_SIZE) {
          previewContent = textContent;
          isTextPreview = true;
        }
      } else if (
        contentType.startsWith("image/") ||
        contentType === "application/pdf"
      ) {
        // For images and PDFs, read as base64
        const fileContent = await codebase.readFileBytes(filePath);
        if (fileContent.length <= MAX_PREVIEW_SIZE) {
          previewContent = Buffer.from(fileContent).toString("base64");
        }
      }

      return {
        success: true,
        fileName: args.fileName,
        contentType,
        canPreview: previewContent !== null,
        previewContent,
        isTextPreview,
        size: assetMetadata?.fileSize || 0,
        description: assetMetadata?.description,
      };
    } catch (error) {
      console.error("Error previewing asset:", error);
      throw new Error(
        `Failed to preview asset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
