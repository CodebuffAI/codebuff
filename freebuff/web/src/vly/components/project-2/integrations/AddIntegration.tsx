// import { useState, useEffect } from "react";
// import { api } from "@/convex/_generated/api";
// import { useMutation, useAction } from "convex/react";
// import { Button } from "@/vly/components/ui/button";
// import { Input } from "@/vly/components/ui/input";
// import { Textarea } from "@/vly/components/ui/textarea";
// import { toast } from "sonner";
// import {
//   Upload,
//   X,
//   ChevronDown,
//   ChevronUp,
//   Sparkles,
//   Check,
// } from "lucide-react";
// import { cn } from "@/vly/lib/utils";

// interface AddIntegrationProps {
//   semanticIdentifier: string;
//   onSuccess: (integrationId?: string) => void;
//   formData?: any;
//   setFormData?: (data: any) => void;
// }

// export function AddIntegration({
//   semanticIdentifier,
//   onSuccess,
//   formData: controlledFormData,
//   setFormData: setControlledFormData,
// }: AddIntegrationProps) {
//   const [uncontrolledFormData, setUncontrolledFormData] = useState({
//     title: "",
//     description: "",
//     cover_image: "",
//     tags: "",
//     features: "",
//     documentation_urls: [""],
//     llm_instructions: "",
//     user_instructions: "",
//     human_added_notes: "",
//     env_variables: [{ id: "", description: "" }],
//     images: [""],
//   });
//   const formData = controlledFormData ?? uncontrolledFormData;
//   const setFormData = setControlledFormData ?? setUncontrolledFormData;
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [isManualFormExpanded, setIsManualFormExpanded] = useState(false);
//   const [aiInput, setAiInput] = useState("");
//   const [isGenerating, setIsGenerating] = useState(false);
//   const [completedSteps, setCompletedSteps] = useState<number[]>([]);
//   const [hasGeneratedData, setHasGeneratedData] = useState(false);
//   const [isReviewMode, setIsReviewMode] = useState(false);

//   // Mutations
//   const addIntegration = useMutation(api.integrations.addIntegration);
//   const addToProject = useMutation(api.integrations.addIntegrationToProject);
//   const generateUploadUrl = useMutation(api.integrations.generateUploadUrl);
//   const saveFileUrl = useMutation(api.integrations.saveFileUrl);

//   // Load saved integration data on mount
//   useEffect(() => {
//     const savedData = localStorage.getItem(
//       `integration-draft-${semanticIdentifier}`,
//     );
//     if (savedData) {
//       try {
//         const parsedData = JSON.parse(savedData);
//         setFormData(parsedData.formData);
//         setHasGeneratedData(parsedData.hasGeneratedData);
//         setIsReviewMode(parsedData.isReviewMode || false);
//         setIsManualFormExpanded(parsedData.hasGeneratedData);
//         setAiInput(parsedData.aiInput || "");

//         if (parsedData.hasGeneratedData) {
//           toast.info("Restored your unsaved integration", {
//             description: "Your previous integration draft has been restored.",
//           });
//         }
//       } catch (error) {
//         console.error("Failed to load saved integration data:", error);
//         localStorage.removeItem(`integration-draft-${semanticIdentifier}`);
//       }
//     }
//   }, [semanticIdentifier, setFormData]);

//   // Save integration data to localStorage when it changes
//   useEffect(() => {
//     if (hasGeneratedData && formData.title && formData.description) {
//       const dataToSave = {
//         formData,
//         hasGeneratedData,
//         isReviewMode,
//         aiInput,
//         timestamp: Date.now(),
//       };
//       localStorage.setItem(
//         `integration-draft-${semanticIdentifier}`,
//         JSON.stringify(dataToSave),
//       );
//     }
//   }, [formData, hasGeneratedData, aiInput, semanticIdentifier]);

//   // Loading step management
//   useEffect(() => {
//     if (!isGenerating) {
//       return;
//     }

//     console.log("Starting step timers...");
//     setCompletedSteps([]);

//     // Progressive step completion
//     const steps = [
//       { delay: 3000, step: 0 }, // Step 1: 3s
//       { delay: 8000, step: 1 }, // Step 2: 8s
//       { delay: 15000, step: 2 }, // Step 3: 15s
//       { delay: 25000, step: 3 }, // Step 4: 25s
//     ];

//     const timeouts = steps.map(({ delay, step }) =>
//       setTimeout(() => {
//         console.log(`Completing step ${step}`);
//         setCompletedSteps((prev) => {
//           const newSteps = [...prev, step];
//           console.log("Updated completed steps:", newSteps);
//           return newSteps;
//         });
//       }, delay),
//     );

//     return () => {
//       console.log("Cleaning up step timers");
//       timeouts.forEach((timeout) => clearTimeout(timeout));
//     };
//   }, [isGenerating]);

//   const handleAiSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!aiInput.trim()) return;

//     setIsGenerating(true);
//     setCompletedSteps([]);
//     setHasGeneratedData(false);
//     toast.info("Generating integration...", {
//       description:
//         "This will continue even if you switch tabs. Your draft will be saved locally.",
//     });

//     try {
//       const generatedData = await generateIntegration({
//         userInput: aiInput,
//         semanticIdentifier,
//       });

//       // Update form with generated data
//       setFormData({
//         ...formData,
//         title: generatedData.title,
//         description: generatedData.description,
//         tags: generatedData.tags.join(", "),
//         documentation_urls: generatedData.documentation_urls,
//         llm_instructions: generatedData.llm_instructions,
//         user_instructions: generatedData.user_instructions,
//         env_variables: generatedData.env_variables,
//       });

//       // Mark as having generated data for auto-save
//       setHasGeneratedData(true);

//       // Put into review mode first
//       setIsReviewMode(true);

//       // Expand the manual form to show the generated data
//       setIsManualFormExpanded(true);

//       toast.success("Integration generated", {
//         description:
//           "Review and edit the details below, then click 'Confirm & Add Integration' to save.",
//       });
//     } catch (error) {
//       toast.error("Error", {
//         description:
//           "Failed to generate integration. Please try again or add manually.",
//       });
//     } finally {
//       setIsGenerating(false);
//       setCompletedSteps([]);
//     }
//   };

//   const handleFileUpload = async (
//     file: File,
//     type: "logo" | "image",
//     index?: number,
//   ): Promise<string> => {
//     try {
//       // Step 1: Get a short-lived upload URL
//       const uploadUrl = await generateUploadUrl();

//       // Step 2: POST the file to the URL
//       const result = await fetch(uploadUrl, {
//         method: "POST",
//         headers: { "Content-Type": file.type },
//         body: file,
//       });

//       if (!result.ok) {
//         throw new Error("Failed to upload file");
//       }

//       const { storageId } = await result.json();

//       // Step 3: Save the file URL
//       const url = await saveFileUrl({ storageId, type, index });
//       if (!url) throw new Error("Failed to get file URL");

//       return url;
//     } catch (error) {
//       throw new Error("Failed to upload file");
//     }
//   };

//   const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (!file) return;

//     try {
//       const url = await handleFileUpload(file, "logo");
//       setFormData({ ...formData, cover_image: url });
//     } catch (error) {
//       toast.error("Error uploading image", {
//         description: "Failed to upload the image. Please try again.",
//       });
//     }
//   };

//   const handleImageUpload = async (
//     e: React.ChangeEvent<HTMLInputElement>,
//     index: number,
//   ) => {
//     const file = e.target.files?.[0];
//     if (!file) return;

//     try {
//       const url = await handleFileUpload(file, "image", index);
//       const newImages = [...formData.images];
//       newImages[index] = url;
//       setFormData({ ...formData, images: newImages });
//     } catch (error) {
//       toast.error("Error uploading image", {
//         description: "Failed to upload the image. Please try again.",
//       });
//     }
//   };

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsSubmitting(true);

//     try {
//       // Create the integration
//       const integrationId = await addIntegration({
//         title: formData.title,
//         description: formData.description,
//         cover_image: formData.cover_image,
//         tags: formData.tags.split(",").map((tag: string) => tag.trim()),
//         documentation_urls: formData.documentation_urls.filter(
//           (url: string) => url,
//         ),
//         llm_instructions: formData.llm_instructions,
//         user_instructions: formData.user_instructions,
//         human_added_notes: formData.human_added_notes,
//         env_variables: formData.env_variables.filter(
//           (v: { id: string; description: string }) => v.id && v.description,
//         ),
//         images: formData.images.filter((img: string) => img),
//         semanticIdentifier: semanticIdentifier,
//       });

//       if (!integrationId) throw new Error("Failed to create integration");

//       // Add the integration to the project
//       await addToProject({
//         semanticIdentifier,
//         integrationId: integrationId._id,
//       });

//       toast.success("Integration added", {
//         description: "The integration has been added to your project.",
//       });

//       // Clear saved draft and reset form
//       localStorage.removeItem(`integration-draft-${semanticIdentifier}`);
//       setHasGeneratedData(false);
//       setIsReviewMode(false);
//       setFormData({
//         title: "",
//         description: "",
//         cover_image: "",
//         tags: "",
//         features: "",
//         documentation_urls: [""],
//         llm_instructions: "",
//         user_instructions: "",
//         human_added_notes: "",
//         env_variables: [{ id: "", description: "" }],
//         images: [""],
//       });

//       onSuccess(integrationId._id);

//       // todo: spawn new message for integrating
//     } catch (error) {
//       toast.error("Error", {
//         description: "Failed to add integration. Please try again.",
//       });
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   const addEnvVariable = () => {
//     setFormData({
//       ...formData,
//       env_variables: [...formData.env_variables, { id: "", description: "" }],
//     });
//   };

//   const updateEnvVariable = (
//     index: number,
//     field: "id" | "description",
//     value: string,
//   ) => {
//     const newEnvVars = formData.env_variables.map(
//       (env: { id: string; description: string }, i: number) =>
//         i === index ? { ...env, [field]: value } : env,
//     );
//     setFormData({ ...formData, env_variables: newEnvVars });
//   };

//   const addImage = () => {
//     setFormData({ ...formData, images: [...formData.images, ""] });
//   };

//   const updateImage = (index: number, value: string) => {
//     const newImages = formData.images.map((image: string, i: number) =>
//       i === index ? value : image,
//     );
//     setFormData({ ...formData, images: newImages });
//   };

//   const removeImage = (index: number) => {
//     const newImages = formData.images.filter(
//       (_: string, i: number) => i !== index,
//     );
//     setFormData({ ...formData, images: newImages });
//   };

//   const addDocumentationUrl = () => {
//     setFormData({
//       ...formData,
//       documentation_urls: [...formData.documentation_urls, ""],
//     });
//   };

//   const updateDocumentationUrl = (index: number, value: string) => {
//     const newUrls = formData.documentation_urls.map((url: string, i: number) =>
//       i === index ? value : url,
//     );
//     setFormData({ ...formData, documentation_urls: newUrls });
//   };

//   const removeDocumentationUrl = (index: number) => {
//     const newUrls = formData.documentation_urls.filter(
//       (_: string, i: number) => i !== index,
//     );
//     setFormData({ ...formData, documentation_urls: newUrls });
//   };

//   return (
//     <div className="flex h-full min-h-0 flex-col">
//       <div className="min-h-0 flex-1 overflow-y-auto p-6">
//         <div className="mx-auto max-w-2xl space-y-6">
//           {/* AI-Powered Form */}
//           <div className="space-y-4">
//             <div className="flex items-center gap-2">
//               <Sparkles className="h-5 w-5 text-primary" />
//               <h2 className="text-lg font-semibold">AI-Powered Integration</h2>
//             </div>
//             <p className="text-sm text-muted-foreground">
//               Our AI research agent searches official documentation and performs
//               web searches to gather comprehensive integration details. Simply
//               describe what you want to integrate.
//             </p>
//             {hasGeneratedData && (
//               <div className="flex items-center justify-between rounded-md bg-blue-50 p-3 text-sm">
//                 <div className="flex items-center gap-2">
//                   <div className="h-2 w-2 rounded-full bg-blue-500"></div>
//                   <span className="text-blue-700">
//                     Draft saved locally - preserved across page reloads until
//                     you add the integration
//                   </span>
//                 </div>
//                 <Button
//                   variant="ghost"
//                   size="sm"
//                   onClick={() => {
//                     localStorage.removeItem(
//                       `integration-draft-${semanticIdentifier}`,
//                     );
//                     setHasGeneratedData(false);
//                     setIsReviewMode(false);
//                     setFormData({
//                       title: "",
//                       description: "",
//                       cover_image: "",
//                       tags: "",
//                       features: "",
//                       documentation_urls: [""],
//                       llm_instructions: "",
//                       user_instructions: "",
//                       human_added_notes: "",
//                       env_variables: [{ id: "", description: "" }],
//                       images: [""],
//                     });
//                     setIsManualFormExpanded(false);
//                     toast.success("Draft cleared");
//                   }}
//                   className="text-blue-600 hover:text-blue-800"
//                 >
//                   Clear Draft
//                 </Button>
//               </div>
//             )}
//             <form onSubmit={handleAiSubmit} className="space-y-4">
//               <Textarea
//                 placeholder="Describe the integration you want to add..."
//                 value={aiInput}
//                 onChange={(e) => setAiInput(e.target.value)}
//                 className="min-h-[180px]"
//                 rows={8}
//               />
//               <Button type="submit" disabled={isGenerating}>
//                 {isGenerating
//                   ? "🔍 Researching and generating integration..."
//                   : "Generate Integration with AI"}
//               </Button>
//               {isGenerating && (
//                 <div className="space-y-2 rounded-md bg-muted p-4">
//                   <div className="flex items-center gap-2">
//                     {completedSteps.includes(0) ? (
//                       <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
//                         <Check className="h-2.5 w-2.5 text-white" />
//                       </div>
//                     ) : (
//                       <div className="h-2 w-2 animate-pulse rounded-full bg-primary"></div>
//                     )}
//                     <span
//                       className={cn(
//                         "text-sm",
//                         completedSteps.includes(0) &&
//                           "font-medium text-green-600",
//                       )}
//                     >
//                       Scanning the web for official docs...
//                     </span>
//                   </div>
//                   <div className="flex items-center gap-2">
//                     {completedSteps.includes(1) ? (
//                       <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
//                         <Check className="h-2.5 w-2.5 text-white" />
//                       </div>
//                     ) : (
//                       <div className="h-2 w-2 animate-pulse rounded-full bg-primary"></div>
//                     )}
//                     <span
//                       className={cn(
//                         "text-sm",
//                         completedSteps.includes(1) &&
//                           "font-medium text-green-600",
//                       )}
//                     >
//                       Gathering comprehensive resources...
//                     </span>
//                   </div>
//                   <div className="flex items-center gap-2">
//                     {completedSteps.includes(2) ? (
//                       <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
//                         <Check className="h-2.5 w-2.5 text-white" />
//                       </div>
//                     ) : (
//                       <div className="h-2 w-2 animate-pulse rounded-full bg-primary"></div>
//                     )}
//                     <span
//                       className={cn(
//                         "text-sm",
//                         completedSteps.includes(2) &&
//                           "font-medium text-green-600",
//                       )}
//                     >
//                       Digging deeper with web search...
//                     </span>
//                   </div>
//                   <div className="flex items-center gap-2">
//                     {completedSteps.includes(3) ? (
//                       <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
//                         <Check className="h-2.5 w-2.5 text-white" />
//                       </div>
//                     ) : (
//                       <div className="h-2 w-2 animate-pulse rounded-full bg-primary"></div>
//                     )}
//                     <span
//                       className={cn(
//                         "text-sm",
//                         completedSteps.includes(3) &&
//                           "font-medium text-green-600",
//                       )}
//                     >
//                       Crafting your integration blueprint...
//                     </span>
//                   </div>
//                 </div>
//               )}
//             </form>
//           </div>

//           {/* Manual Form Toggle */}
//           <div className="flex items-center justify-between border-t pt-4">
//             <div className="flex items-center gap-2">
//               <h2 className="text-lg font-semibold">Manual Integration</h2>
//               <Button
//                 variant="ghost"
//                 size="sm"
//                 onClick={() => setIsManualFormExpanded(!isManualFormExpanded)}
//               >
//                 {isManualFormExpanded ? (
//                   <ChevronUp className="h-4 w-4" />
//                 ) : (
//                   <ChevronDown className="h-4 w-4" />
//                 )}
//               </Button>
//             </div>
//           </div>

//           {/* Manual Form */}
//           {isReviewMode && isManualFormExpanded && (
//             <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
//               <div className="flex items-center gap-2">
//                 <Sparkles className="h-4 w-4 text-amber-600" />
//                 <h3 className="font-medium text-amber-800">
//                   Review AI-Generated Integration
//                 </h3>
//               </div>
//               <p className="mt-1 text-sm text-amber-700">
//                 The details below were generated by AI. Review them carefully
//                 and make any necessary edits before confirming.
//               </p>
//             </div>
//           )}

//           <form
//             onSubmit={handleSubmit}
//             className={cn(
//               "space-y-6 transition-all duration-200",
//               !isManualFormExpanded && "hidden",
//             )}
//           >
//             <div className="space-y-4">
//               <div>
//                 <label
//                   htmlFor="title"
//                   className="mb-1 block text-sm font-medium"
//                 >
//                   Title
//                 </label>
//                 <Input
//                   id="title"
//                   value={formData.title}
//                   onChange={(e) =>
//                     setFormData({ ...formData, title: e.target.value })
//                   }
//                   required
//                 />
//               </div>

//               <div>
//                 <label
//                   htmlFor="description"
//                   className="mb-1 block text-sm font-medium"
//                 >
//                   Description
//                 </label>
//                 <Textarea
//                   id="description"
//                   value={formData.description}
//                   onChange={(e) =>
//                     setFormData({ ...formData, description: e.target.value })
//                   }
//                   required
//                   className="min-h-[180px]"
//                   rows={8}
//                 />
//               </div>

//               <div>
//                 <label
//                   htmlFor="cover_image"
//                   className="mb-1 block text-sm font-medium"
//                 >
//                   Logo
//                 </label>
//                 <div className="space-y-2">
//                   <div className="flex gap-2">
//                     <Input
//                       id="cover_image"
//                       type="url"
//                       placeholder="Logo URL"
//                       value={formData.cover_image}
//                       onChange={(e) =>
//                         setFormData({
//                           ...formData,
//                           cover_image: e.target.value,
//                         })
//                       }
//                     />
//                     <div className="relative">
//                       <Input
//                         type="file"
//                         accept="image/*"
//                         className="hidden"
//                         id="logo-upload"
//                         onChange={handleLogoUpload}
//                       />
//                       <label
//                         htmlFor="logo-upload"
//                         className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 hover:bg-accent hover:text-accent-foreground"
//                       >
//                         <Upload className="mr-2 h-4 w-4" />
//                         Upload
//                       </label>
//                     </div>
//                   </div>
//                   {formData.cover_image && (
//                     <div className="relative h-32 w-32">
//                       <img
//                         src={formData.cover_image || undefined}
//                         alt="Logo preview"
//                         className="h-full w-full rounded-md object-contain"
//                       />
//                       <button
//                         type="button"
//                         onClick={() =>
//                           setFormData({ ...formData, cover_image: "" })
//                         }
//                         className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground hover:bg-destructive/90"
//                       >
//                         <X className="h-4 w-4" />
//                       </button>
//                     </div>
//                   )}
//                 </div>
//               </div>

//               <div>
//                 <label
//                   htmlFor="tags"
//                   className="mb-1 block text-sm font-medium"
//                 >
//                   Tags (comma-separated)
//                 </label>
//                 <Input
//                   id="tags"
//                   value={formData.tags}
//                   onChange={(e) =>
//                     setFormData({ ...formData, tags: e.target.value })
//                   }
//                   required
//                 />
//               </div>

//               <div>
//                 <label
//                   htmlFor="documentation_urls"
//                   className="mb-1 block text-sm font-medium"
//                 >
//                   Documentation URLs
//                 </label>
//                 <div className="space-y-2">
//                   {(Array.isArray(formData.documentation_urls)
//                     ? formData.documentation_urls
//                     : [formData.documentation_urls || ""]
//                   ).map((url: string, index: number) => (
//                     <div key={index} className="flex gap-2">
//                       <Input
//                         type="url"
//                         placeholder="Documentation URL"
//                         value={url}
//                         onChange={(e) =>
//                           updateDocumentationUrl(index, e.target.value)
//                         }
//                       />
//                       <Button
//                         type="button"
//                         variant="destructive"
//                         size="icon"
//                         onClick={() => removeDocumentationUrl(index)}
//                         disabled={
//                           (Array.isArray(formData.documentation_urls)
//                             ? formData.documentation_urls
//                             : [formData.documentation_urls || ""]
//                           ).length === 1
//                         }
//                       >
//                         <X className="h-4 w-4" />
//                       </Button>
//                     </div>
//                   ))}
//                   <Button
//                     type="button"
//                     variant="outline"
//                     onClick={addDocumentationUrl}
//                   >
//                     Add Documentation URL
//                   </Button>
//                 </div>
//               </div>

//               <div>
//                 <label
//                   htmlFor="llm_instructions"
//                   className="mb-1 block text-sm font-medium"
//                 >
//                   LLM Instructions
//                 </label>
//                 <Textarea
//                   id="llm_instructions"
//                   value={formData.llm_instructions}
//                   onChange={(e) =>
//                     setFormData({
//                       ...formData,
//                       llm_instructions: e.target.value,
//                     })
//                   }
//                   required
//                   className="min-h-[180px]"
//                   rows={8}
//                 />
//               </div>

//               <div>
//                 <label
//                   htmlFor="user_instructions"
//                   className="mb-1 block text-sm font-medium"
//                 >
//                   User Instructions
//                 </label>
//                 <Textarea
//                   id="user_instructions"
//                   value={formData.user_instructions}
//                   onChange={(e) =>
//                     setFormData({
//                       ...formData,
//                       user_instructions: e.target.value,
//                     })
//                   }
//                   required
//                   className="min-h-[180px]"
//                   rows={8}
//                 />
//               </div>

//               <div>
//                 <label
//                   htmlFor="human_added_notes"
//                   className="mb-1 block text-sm font-medium"
//                 >
//                   Notes
//                 </label>
//                 <Textarea
//                   id="human_added_notes"
//                   value={formData.human_added_notes}
//                   onChange={(e) =>
//                     setFormData({
//                       ...formData,
//                       human_added_notes: e.target.value,
//                     })
//                   }
//                   className="min-h-[180px]"
//                   rows={8}
//                 />
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-medium">
//                   API keys
//                 </label>
//                 <div className="space-y-2">
//                   {formData.env_variables.map(
//                     (
//                       env: { id: string; description: string },
//                       index: number,
//                     ) => (
//                       <div key={index} className="flex gap-2">
//                         <Input
//                           placeholder="Variable ID"
//                           value={env.id}
//                           onChange={(e) =>
//                             updateEnvVariable(index, "id", e.target.value)
//                           }
//                         />
//                         <Input
//                           placeholder="Description"
//                           value={env.description}
//                           onChange={(e) =>
//                             updateEnvVariable(
//                               index,
//                               "description",
//                               e.target.value,
//                             )
//                           }
//                         />
//                       </div>
//                     ),
//                   )}
//                   <Button
//                     type="button"
//                     variant="outline"
//                     onClick={addEnvVariable}
//                   >
//                     Add API key
//                   </Button>
//                 </div>
//               </div>

//               <div>
//                 <label className="mb-1 block text-sm font-medium">
//                   Additional Images
//                 </label>
//                 <div className="space-y-4">
//                   {formData.images.map((image: string, index: number) => (
//                     <div key={index} className="space-y-2">
//                       <div className="flex gap-2">
//                         <Input
//                           type="url"
//                           placeholder="Image URL"
//                           value={image}
//                           onChange={(e) => updateImage(index, e.target.value)}
//                         />
//                         <div className="relative">
//                           <Input
//                             type="file"
//                             accept="image/*"
//                             className="hidden"
//                             id={`image-upload-${index}`}
//                             onChange={(e) => handleImageUpload(e, index)}
//                           />
//                           <label
//                             htmlFor={`image-upload-${index}`}
//                             className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 hover:bg-accent hover:text-accent-foreground"
//                           >
//                             <Upload className="mr-2 h-4 w-4" />
//                             Upload
//                           </label>
//                         </div>
//                         <Button
//                           type="button"
//                           variant="destructive"
//                           size="icon"
//                           onClick={() => removeImage(index)}
//                         >
//                           <X className="h-4 w-4" />
//                         </Button>
//                       </div>
//                       {image && (
//                         <div className="relative h-32 w-32">
//                           <img
//                             src={image || undefined}
//                             alt={`Image ${index + 1} preview`}
//                             className="h-full w-full rounded-md object-contain"
//                           />
//                         </div>
//                       )}
//                     </div>
//                   ))}
//                   <Button type="button" variant="outline" onClick={addImage}>
//                     Add Image
//                   </Button>
//                 </div>
//               </div>
//             </div>

//             <div className="flex gap-3">
//               {isReviewMode && (
//                 <Button
//                   type="button"
//                   variant="outline"
//                   onClick={() => {
//                     setIsReviewMode(false);
//                     toast.info(
//                       "You can now edit the integration details before saving.",
//                     );
//                   }}
//                   disabled={isSubmitting}
//                 >
//                   Edit Details
//                 </Button>
//               )}
//               <Button type="submit" disabled={isSubmitting}>
//                 {isSubmitting
//                   ? "Adding..."
//                   : isReviewMode
//                     ? "Confirm & Add Integration"
//                     : "Add Integration"}
//               </Button>
//             </div>
//           </form>
//         </div>
//       </div>
//     </div>
//   );
// }
