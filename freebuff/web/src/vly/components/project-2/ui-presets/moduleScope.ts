/**
 * Module Scope for Live Component Preview
 *
 * This file contains all the modules that are available to dynamically
 * rendered components. When a component from Convex uses imports like
 * `import { Button } from "@/vly/components/ui/button"`, they resolve from here.
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
import { cn } from "@/vly/lib/utils";

// shadcn/ui components
import * as Accordion from "@/vly/components/ui/accordion";
import * as AlertDialog from "@/vly/components/ui/alert-dialog";
import * as Alert from "@/vly/components/ui/alert";
import * as AspectRatio from "@/vly/components/ui/aspect-ratio";
import * as Avatar from "@/vly/components/ui/avatar";
import * as Badge from "@/vly/components/ui/badge";
import * as Breadcrumb from "@/vly/components/ui/breadcrumb";
import * as Button from "@/vly/components/ui/button";
import * as Calendar from "@/vly/components/ui/calendar";
import * as Card from "@/vly/components/ui/card";
import * as Carousel from "@/vly/components/ui/carousel";
import * as Checkbox from "@/vly/components/ui/checkbox";
import * as Collapsible from "@/vly/components/ui/collapsible";
import * as Command from "@/vly/components/ui/command";
import * as ContextMenu from "@/vly/components/ui/context-menu";
import * as Dialog from "@/vly/components/ui/dialog";
import * as Drawer from "@/vly/components/ui/drawer";
import * as DropdownMenu from "@/vly/components/ui/dropdown-menu";
import * as Form from "@/vly/components/ui/form";
import * as HoverCard from "@/vly/components/ui/hover-card";
import * as Input from "@/vly/components/ui/input";
import * as InputOtp from "@/vly/components/ui/input-otp";
import * as Label from "@/vly/components/ui/label";
import * as Menubar from "@/vly/components/ui/menubar";
import * as NavigationMenu from "@/vly/components/ui/navigation-menu";
import * as Pagination from "@/vly/components/ui/pagination";
import * as Popover from "@/vly/components/ui/popover";
import * as Progress from "@/vly/components/ui/progress";
import * as RadioGroup from "@/vly/components/ui/radio-group";
import * as Resizable from "@/vly/components/ui/resizable";
import * as ScrollArea from "@/vly/components/ui/scroll-area";
import * as Select from "@/vly/components/ui/select";
import * as Separator from "@/vly/components/ui/separator";
import * as Sheet from "@/vly/components/ui/sheet";
import * as Skeleton from "@/vly/components/ui/skeleton";
import * as Slider from "@/vly/components/ui/slider";
import * as Switch from "@/vly/components/ui/switch";
import * as Table from "@/vly/components/ui/table";
import * as Tabs from "@/vly/components/ui/tabs";
import * as Textarea from "@/vly/components/ui/textarea";
import * as Toast from "@/vly/components/ui/toast";
import * as Toggle from "@/vly/components/ui/toggle";
import * as ToggleGroup from "@/vly/components/ui/toggle-group";
import * as Tooltip from "@/vly/components/ui/tooltip";
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
 * `import { Button } from "@/vly/components/ui/button"` → __modules["@/vly/components/ui/button"].Button
 */
const __modules: ModuleRegistry = {
  // React
  react: React,

  // Utility libraries
  clsx: { clsx, default: clsx },
  "tailwind-merge": { twMerge },
  "@/vly/lib/utils": { cn },

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
  "@/vly/components/ui/accordion": Accordion,
  "@/vly/components/ui/alert-dialog": AlertDialog,
  "@/vly/components/ui/alert": Alert,
  "@/vly/components/ui/aspect-ratio": AspectRatio,
  "@/vly/components/ui/avatar": Avatar,
  "@/vly/components/ui/badge": Badge,
  "@/vly/components/ui/breadcrumb": Breadcrumb,
  "@/vly/components/ui/button": Button,
  "@/vly/components/ui/calendar": Calendar,
  "@/vly/components/ui/card": Card,
  "@/vly/components/ui/carousel": Carousel,
  "@/vly/components/ui/checkbox": Checkbox,
  "@/vly/components/ui/collapsible": Collapsible,
  "@/vly/components/ui/command": Command,
  "@/vly/components/ui/context-menu": ContextMenu,
  "@/vly/components/ui/dialog": Dialog,
  "@/vly/components/ui/drawer": Drawer,
  "@/vly/components/ui/dropdown-menu": DropdownMenu,
  "@/vly/components/ui/form": Form,
  "@/vly/components/ui/hover-card": HoverCard,
  "@/vly/components/ui/input": Input,
  "@/vly/components/ui/input-otp": InputOtp,
  "@/vly/components/ui/label": Label,
  "@/vly/components/ui/menubar": Menubar,
  "@/vly/components/ui/navigation-menu": NavigationMenu,
  "@/vly/components/ui/pagination": Pagination,
  "@/vly/components/ui/popover": Popover,
  "@/vly/components/ui/progress": Progress,
  "@/vly/components/ui/radio-group": RadioGroup,
  "@/vly/components/ui/resizable": Resizable,
  "@/vly/components/ui/scroll-area": ScrollArea,
  "@/vly/components/ui/select": Select,
  "@/vly/components/ui/separator": Separator,
  "@/vly/components/ui/sheet": Sheet,
  "@/vly/components/ui/skeleton": Skeleton,
  "@/vly/components/ui/slider": Slider,
  "@/vly/components/ui/switch": Switch,
  "@/vly/components/ui/table": Table,
  "@/vly/components/ui/tabs": Tabs,
  "@/vly/components/ui/textarea": Textarea,
  "@/vly/components/ui/toast": Toast,
  "@/vly/components/ui/toggle": Toggle,
  "@/vly/components/ui/toggle-group": ToggleGroup,
  "@/vly/components/ui/tooltip": Tooltip,
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
    "@/vly/components/ui/button",
    "@/vly/lib/utils",
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
