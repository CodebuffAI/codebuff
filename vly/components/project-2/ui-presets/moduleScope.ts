/**
 * Module Scope for Live Component Preview
 *
 * This file contains all the modules that are available to dynamically
 * rendered components. When a component from Convex uses imports like
 * `import { Button } from "@/components/ui/button"`, they resolve from here.
 *
 * To add a new module:
 * 1. Import it at the top of this file
 * 2. Add it to the __modules object with its import path as the key
 */

import React from "react";
import * as jsxRuntime from "react/jsx-runtime";

// ============================================================================
// TYPES
// ============================================================================

type ModuleRegistry = Record<string, unknown>;

interface JSXRuntime {
  jsx: typeof jsxRuntime.jsx;
  jsxs: typeof jsxRuntime.jsxs;
  Fragment: typeof jsxRuntime.Fragment;
}

// Core libraries
import * as LucideIcons from "lucide-react";
import * as FramerMotion from "framer-motion";
import * as Motion from "motion/react";
import * as THREE from "three";
import * as TSParticlesEngine from "@tsparticles/engine";
import * as TSParticlesReact from "@tsparticles/react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import * as TSParticlesSlim from "@tsparticles/slim";
import { loadSlim } from "@tsparticles/slim";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { cn } from "@/lib/utils";

// shadcn/ui components
import * as Accordion from "@/components/ui/accordion";
import * as AlertDialog from "@/components/ui/alert-dialog";
import * as Alert from "@/components/ui/alert";
import * as AspectRatio from "@/components/ui/aspect-ratio";
import * as Avatar from "@/components/ui/avatar";
import * as Badge from "@/components/ui/badge";
import * as Breadcrumb from "@/components/ui/breadcrumb";
import * as Button from "@/components/ui/button";
import * as Calendar from "@/components/ui/calendar";
import * as Card from "@/components/ui/card";
import * as Carousel from "@/components/ui/carousel";
import * as Checkbox from "@/components/ui/checkbox";
import * as Collapsible from "@/components/ui/collapsible";
import * as Command from "@/components/ui/command";
import * as ContextMenu from "@/components/ui/context-menu";
import * as Dialog from "@/components/ui/dialog";
import * as Drawer from "@/components/ui/drawer";
import * as DropdownMenu from "@/components/ui/dropdown-menu";
import * as Form from "@/components/ui/form";
import * as HoverCard from "@/components/ui/hover-card";
import * as Input from "@/components/ui/input";
import * as InputOtp from "@/components/ui/input-otp";
import * as Label from "@/components/ui/label";
import * as Menubar from "@/components/ui/menubar";
import * as NavigationMenu from "@/components/ui/navigation-menu";
import * as Pagination from "@/components/ui/pagination";
import * as Popover from "@/components/ui/popover";
import * as Progress from "@/components/ui/progress";
import * as RadioGroup from "@/components/ui/radio-group";
import * as Resizable from "@/components/ui/resizable";
import * as ScrollArea from "@/components/ui/scroll-area";
import * as Select from "@/components/ui/select";
import * as Separator from "@/components/ui/separator";
import * as Sheet from "@/components/ui/sheet";
import * as Skeleton from "@/components/ui/skeleton";
import * as Slider from "@/components/ui/slider";
import * as Switch from "@/components/ui/switch";
import * as Table from "@/components/ui/table";
import * as Tabs from "@/components/ui/tabs";
import * as Textarea from "@/components/ui/textarea";
import * as Toast from "@/components/ui/toast";
import * as Toggle from "@/components/ui/toggle";
import * as ToggleGroup from "@/components/ui/toggle-group";
import * as Tooltip from "@/components/ui/tooltip";
import * as DottedMap from "dotted-map";
import * as _tabler_icons_react from "@tabler/icons-react";
import * as _radix_ui_react_hover_card from "@radix-ui/react-hover-card";
import * as _react_three_fiber from "@react-three/fiber";

// ============================================================================
// MODULE REGISTRY
// ============================================================================

/**
 * __modules - Module registry keyed by import path
 *
 * This allows dynamic components to resolve imports like:
 * `import { Button } from "@/components/ui/button"` → __modules["@/components/ui/button"].Button
 */
const __modules: ModuleRegistry = {
  // React
  react: React,

  // Utility libraries
  clsx: { clsx, default: clsx },
  "tailwind-merge": { twMerge },
  "@/lib/utils": { cn },

  // Icon library
  "lucide-react": LucideIcons,

  // Animation libraries
  "framer-motion": FramerMotion,
  "motion/react": Motion,

  // 3D library
  three: THREE,

  // Particle libraries
  "@tsparticles/engine": TSParticlesEngine,
  "@tsparticles/react": {
    ...TSParticlesReact,
    default: Particles,
    Particles,
    initParticlesEngine,
  },
  "@tsparticles/slim": { ...TSParticlesSlim, loadSlim },

  // shadcn/ui components
  "@/components/ui/accordion": Accordion,
  "@/components/ui/alert-dialog": AlertDialog,
  "@/components/ui/alert": Alert,
  "@/components/ui/aspect-ratio": AspectRatio,
  "@/components/ui/avatar": Avatar,
  "@/components/ui/badge": Badge,
  "@/components/ui/breadcrumb": Breadcrumb,
  "@/components/ui/button": Button,
  "@/components/ui/calendar": Calendar,
  "@/components/ui/card": Card,
  "@/components/ui/carousel": Carousel,
  "@/components/ui/checkbox": Checkbox,
  "@/components/ui/collapsible": Collapsible,
  "@/components/ui/command": Command,
  "@/components/ui/context-menu": ContextMenu,
  "@/components/ui/dialog": Dialog,
  "@/components/ui/drawer": Drawer,
  "@/components/ui/dropdown-menu": DropdownMenu,
  "@/components/ui/form": Form,
  "@/components/ui/hover-card": HoverCard,
  "@/components/ui/input": Input,
  "@/components/ui/input-otp": InputOtp,
  "@/components/ui/label": Label,
  "@/components/ui/menubar": Menubar,
  "@/components/ui/navigation-menu": NavigationMenu,
  "@/components/ui/pagination": Pagination,
  "@/components/ui/popover": Popover,
  "@/components/ui/progress": Progress,
  "@/components/ui/radio-group": RadioGroup,
  "@/components/ui/resizable": Resizable,
  "@/components/ui/scroll-area": ScrollArea,
  "@/components/ui/select": Select,
  "@/components/ui/separator": Separator,
  "@/components/ui/sheet": Sheet,
  "@/components/ui/skeleton": Skeleton,
  "@/components/ui/slider": Slider,
  "@/components/ui/switch": Switch,
  "@/components/ui/table": Table,
  "@/components/ui/tabs": Tabs,
  "@/components/ui/textarea": Textarea,
  "@/components/ui/toast": Toast,
  "@/components/ui/toggle": Toggle,
  "@/components/ui/toggle-group": ToggleGroup,
  "@/components/ui/tooltip": Tooltip,
  "dotted-map": DottedMap,
  "@tabler/icons-react": _tabler_icons_react,
  "@radix-ui/react-hover-card": _radix_ui_react_hover_card,
  "@react-three/fiber": _react_three_fiber,
};

// ============================================================================
// JSX RUNTIME
// ============================================================================

/**
 * __jsx - JSX runtime for Babel's automatic runtime mode
 */
const __jsx: JSXRuntime = {
  jsx: jsxRuntime.jsx,
  jsxs: jsxRuntime.jsxs,
  Fragment: jsxRuntime.Fragment,
};

/**
 * SCOPE - All modules available to dynamic components
 *
 * Components can use any of these directly:
 * - React hooks: useState, useEffect, useMemo, etc.
 * - Icons: Box, Settings, Loader, etc. (from lucide-react)
 * - Motion: motion, AnimatePresence, animate (from framer-motion)
 * - Utils: cn, clsx, twMerge
 * - UI Components: Button, Card, Dialog, etc. (from shadcn/ui)
 */
export const SCOPE: Record<string, unknown> = {
  // Module registry for import resolution
  __modules,

  // JSX runtime for Babel
  __jsx,

  // React (spread all exports so useState, useEffect etc are directly available)
  React,
  ...React,

  // Icons (spread so Box, Settings etc are directly available)
  ...LucideIcons,

  // Framer Motion (spread first, then explicit overrides for common names)
  ...FramerMotion,

  // Motion (modern motion/react library) - aliased to avoid conflicts
  MotionReact: Motion,

  // Three.js (both as namespace and spread for direct access)
  THREE,
  ...THREE,

  // TSParticles v3 (both as namespace and spread for direct access)
  TSParticlesReact,
  TSParticlesSlim,
  ...TSParticlesSlim,
  // Explicit exports for convenience
  Particles,
  initParticlesEngine,
  loadSlim,

  // Ensure framer-motion's core exports take precedence
  motion: FramerMotion.motion,
  AnimatePresence: FramerMotion.AnimatePresence,
  animate: FramerMotion.animate,

  // Utils
  cn,
  clsx,
  twMerge,

  // shadcn/ui - spread all components
  ...Accordion,
  ...AlertDialog,
  ...Alert,
  ...AspectRatio,
  ...Avatar,
  ...Badge,
  ...Breadcrumb,
  ...Button,
  ...Calendar,
  ...Card,
  ...Carousel,
  ...Checkbox,
  ...Collapsible,
  ...Command,
  ...ContextMenu,
  ...Dialog,
  ...Drawer,
  ...DropdownMenu,
  ...Form,
  ...HoverCard,
  ...Input,
  ...InputOtp,
  ...Label,
  ...Menubar,
  ...NavigationMenu,
  ...Pagination,
  ...Popover,
  ...Progress,
  ...RadioGroup,
  ...Resizable,
  ...ScrollArea,
  ...Select,
  ...Separator,
  ...Sheet,
  ...Skeleton,
  ...Slider,
  ...Switch,
  ...Table,
  ...Tabs,
  ...Textarea,
  ...Toast,
  ...Toggle,
  ...ToggleGroup,
  ...Tooltip,
  ...DottedMap,
  ..._tabler_icons_react,
  ..._radix_ui_react_hover_card,
  ..._react_three_fiber,
};

/**
 * All keys in SCOPE - used for destructuring in dynamic code
 */
export const SCOPE_KEYS = Object.keys(SCOPE);

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that critical modules are present in the scope
 */
function validateModuleScope(): void {
  const criticalModules = [
    "react",
    "@/components/ui/button",
    "@/lib/utils",
    "lucide-react",
  ];

  const missingModules = criticalModules.filter((module) => !__modules[module]);

  if (missingModules.length > 0) {
    console.error("[moduleScope] Critical modules missing:", missingModules);
  }

  // Validate React is available
  if (!React || typeof React !== "object") {
    console.error("[moduleScope] React is not properly loaded");
  }

  // Validate JSX runtime
  if (!__jsx.jsx || !__jsx.jsxs || !__jsx.Fragment) {
    console.error("[moduleScope] JSX runtime is not properly configured");
  }
}

// Run validation in development
if (process.env.NODE_ENV === "development") {
  validateModuleScope();
}

/**
 * Re-export LucideIcons for use in LiveComponentPreview UI
 */
export { LucideIcons };
