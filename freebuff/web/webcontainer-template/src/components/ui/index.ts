/**
 * UI Component Registry
 *
 * This file provides organized exports of all UI components to help AI agents
 * and developers find and import only the components they need.
 *
 * Components are grouped by category and include bundle size hints:
 * - Small (<5KB): Basic components with minimal dependencies
 * - Medium (5-15KB): Components with moderate complexity
 * - Large (>15KB): Complex components with heavy dependencies
 */

// ============================================================================
// BASIC COMPONENTS (Small bundle size)
// ============================================================================

// Typography & Layout
export { Badge } from "./badge";           // ~2KB - Status badges
export { Label } from "./label";           // ~1KB - Form labels
export { Separator } from "./separator";   // ~1KB - Visual dividers
export { Skeleton } from "./skeleton";     // ~1KB - Loading placeholders

// Form Inputs
export { Button } from "./button";         // ~3KB - Primary button component
export { Input } from "./input";           // ~2KB - Text input
export { Textarea } from "./textarea";     // ~2KB - Multi-line text input
export { Checkbox } from "./checkbox";     // ~3KB - Checkbox input
export { Switch } from "./switch";         // ~3KB - Toggle switch
export { Slider } from "./slider";         // ~4KB - Range slider
export { RadioGroup } from "./radio-group"; // ~3KB - Radio button group

// Display Components
export { Avatar } from "./avatar";         // ~3KB - User avatars
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "./card"; // ~2KB - Content cards
export { Progress } from "./progress";     // ~2KB - Progress bars
export { AspectRatio } from "./aspect-ratio"; // ~1KB - Maintain aspect ratios

// ============================================================================
// INTERACTIVE COMPONENTS (Medium bundle size)
// ============================================================================

// Navigation
export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis } from "./breadcrumb"; // ~4KB
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs"; // ~5KB - Tab navigation
export { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink, NavigationMenuIndicator, NavigationMenuViewport, navigationMenuTriggerStyle } from "./navigation-menu"; // ~8KB

// Overlays & Dialogs
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip"; // ~4KB - Hover tooltips
export { Popover, PopoverTrigger, PopoverContent } from "./popover"; // ~5KB - Floating popovers
export { HoverCard, HoverCardTrigger, HoverCardContent } from "./hover-card"; // ~5KB - Hover cards
export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "./dialog"; // ~6KB - Modal dialogs
export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from "./sheet"; // ~6KB - Side sheets
export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./alert-dialog"; // ~6KB

// Menus & Dropdowns
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup } from "./dropdown-menu"; // ~7KB
export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup, ContextMenuPortal, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuRadioGroup } from "./context-menu"; // ~7KB
export { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator, MenubarLabel, MenubarCheckboxItem, MenubarRadioGroup, MenubarRadioItem, MenubarPortal, MenubarSubContent, MenubarSubTrigger, MenubarGroup, MenubarSub, MenubarShortcut } from "./menubar"; // ~8KB

// Form Components
export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton } from "./select"; // ~6KB - Dropdown select
export { Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField } from "./form"; // ~4KB - Form wrapper with validation
export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "./input-otp"; // ~5KB - OTP input

// Content Display
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./accordion"; // ~5KB - Collapsible sections
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./collapsible"; // ~3KB - Simple collapse
export { Toggle, toggleVariants } from "./toggle"; // ~3KB - Toggle button
export { ToggleGroup, ToggleGroupItem } from "./toggle-group"; // ~4KB - Button group toggle
export { Alert, AlertTitle, AlertDescription } from "./alert"; // ~3KB - Alert messages
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from "./table"; // ~4KB - Data tables

// ============================================================================
// ADVANCED COMPONENTS (Large bundle size - use sparingly)
// ============================================================================

// Complex Interactions
export { ScrollArea, ScrollBar } from "./scroll-area"; // ~6KB - Custom scrollbars
export { Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription } from "./drawer"; // ~12KB - Bottom sheet drawer
export { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "./carousel"; // ~15KB - Image/content carousel (uses embla-carousel)
export { Calendar } from "./calendar"; // ~12KB - Date picker calendar (uses react-day-picker)
export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator } from "./command"; // ~10KB - Command palette (uses cmdk)
export { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "./pagination"; // ~5KB

// Layout Components
export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./resizable"; // ~8KB - Resizable panels
export { Sidebar, SidebarProvider, SidebarTrigger, SidebarInset, SidebarHeader, SidebarFooter, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, SidebarMenuBadge, SidebarSeparator, SidebarRail } from "./sidebar"; // ~10KB

// Data Visualization
export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle } from "./chart"; // ~20KB+ (requires recharts - very large!)

// Notifications
export { Toaster } from "./sonner"; // ~8KB - Toast notifications

// ============================================================================
// USAGE EXAMPLES FOR AI AGENTS
// ============================================================================

/**
 * Example: Building a simple form
 *
 * import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
 * import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui";
 * import { Input, Button } from "@/components/ui";
 *
 * Small bundle impact: ~12KB total
 */

/**
 * Example: Building a complex dashboard
 *
 * import { Card, Tabs, Chart } from "@/components/ui";
 * import { Select, Button } from "@/components/ui";
 *
 * Large bundle impact: ~35KB+ (due to Chart/recharts)
 * Consider lazy loading: const Chart = lazy(() => import("@/components/ui/chart"));
 */

/**
 * Example: Building a navigation menu
 *
 * import { NavigationMenu, DropdownMenu } from "@/components/ui";
 * import { Button, Avatar } from "@/components/ui";
 *
 * Medium bundle impact: ~15KB total
 */

// ============================================================================
// OPTIMIZATION TIPS FOR AI AGENTS
// ============================================================================

/**
 * 1. Import only what you need:
 *    ✅ import { Button, Input } from "@/components/ui";
 *    ❌ import * as UI from "@/components/ui";
 *
 * 2. Lazy load heavy components:
 *    const Chart = lazy(() => import("@/components/ui").then(m => ({ default: m.Chart })));
 *    const Calendar = lazy(() => import("@/components/ui/calendar").then(m => ({ default: m.Calendar })));
 *
 * 3. Group imports by route:
 *    - Landing page: Button, Card, Badge (small components only)
 *    - Dashboard: + Chart, Tabs, Select (add medium components)
 *    - Admin: + Command, Carousel (add large components as needed)
 *
 * 4. Prefer native HTML when possible:
 *    - Use <input> instead of Input for simple cases
 *    - Use <button> instead of Button for basic buttons
 *    - Use these components when you need the styling/accessibility features
 */
