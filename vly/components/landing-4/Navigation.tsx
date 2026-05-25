import React, {
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import UserAuthButton from "./UserAuthButton";
import NavItem from "./NavItem";
import MobileMenu from "./MobileMenu";

// Helper for hydration-safe mounted state
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// Style constants
const styles = {
  navLink:
    "cursor-pointer font-['Geist'] text-base font-normal leading-none transition-colors hover:scale-105 hover:text-[#A37FBC] active:scale-95",
  navLinkActive: "text-black",
  navLinkInactive: "text-zinc-500",
  mobileLink:
    "w-full px-4 py-2 text-left font-['Geist'] transition-colors duration-200 hover:bg-[#F5EFFF] hover:text-[#A37FBC]",
  mobileLinkActive: "font-medium text-black",
  mobileLinkInactive: "text-zinc-800",
} as const;

type NavItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  requiresAuth?: boolean;
  showWhenSignedOut?: boolean;
  badge?: React.ReactNode;
};

export default function Navigation({
  isDashboard = false,
}: {
  isDashboard?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const { isLoaded } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const handleNavigate = (path: string) => {
    setMenuOpen(false);
    router.push(path);
  };

  const handleOpenDiscord = () => {
    setMenuOpen(false);
    window.open("https://discord.gg/2gSmB9DxJW", "_blank");
  };

  const toggleMenu = () => {
    setMenuOpen((prev) => !prev);
  };

  const allNavItems: NavItem[] = [
    {
      label: "Home",
      href: "/",
      onClick: () => handleNavigate("/"),
    },
    {
      label: "Community",
      href: "/community",
      onClick: () => handleNavigate("/community"),
    },
    {
      label: "My Projects",
      href: "/dashboard",
      onClick: () => handleNavigate("/dashboard"),
      requiresAuth: true,
      showWhenSignedOut: true,
    },
    {
      label: "Pricing",
      href: "/pricing",
      onClick: () => handleNavigate("/pricing"),
    },
    {
      label: "Earn",
      href: "/earn",
      onClick: () => handleNavigate("/earn"),
      badge: (
        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          new
        </span>
      ),
    },
    {
      label: "Discord",
      onClick: handleOpenDiscord,
    },
    {
      label: "Contact",
      href: "/contact",
      onClick: () => handleNavigate("/contact"),
    },
  ];

  const navItems = allNavItems;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const getNavLinkClass = (href: string) => {
    const isActive = pathname === href;
    return `${styles.navLink} ${isActive ? styles.navLinkActive : styles.navLinkInactive}`;
  };

  const getMobileLinkClass = (href: string) => {
    const isActive = pathname === href;
    return `${styles.mobileLink} ${isActive ? styles.mobileLinkActive : styles.mobileLinkInactive}`;
  };

  return (
    <nav className="absolute left-0 right-0 top-10 z-50 flex justify-center">
      <div
        className={`flex w-full max-w-[2000px] items-center justify-between transition-all duration-300 ${isDashboard ? "px-4 md:px-20" : "px-4 md:px-20"}`}
      >
        {/* Logo */}
        <button
          onClick={() => router.push("/")}
          className="cursor-pointer"
          aria-label="Go to homepage"
        >
          <Image
            src="/logo.svg"
            alt="Logo"
            width={48}
            height={48}
            priority
            className="h-12 w-12 transition-opacity duration-300"
          />
        </button>

        {/* Navigation with glassmorphism */}
        <div className="relative">
          {/* Desktop Navigation */}
          <div className="relative z-10 hidden h-8 items-center justify-end gap-8 rounded-[20px] px-5 py-1.5 transition-all duration-300 lg:flex">
            {navItems.map((item) => {
              const linkClass = item.href
                ? getNavLinkClass(item.href)
                : `${styles.navLink} ${styles.navLinkInactive}`;

              return (
                <NavItem
                  key={item.label}
                  label={item.label}
                  href={item.href}
                  onClick={item.onClick}
                  requiresAuth={item.requiresAuth}
                  showWhenSignedOut={item.showWhenSignedOut}
                  className={linkClass}
                  mounted={mounted}
                  isLoaded={isLoaded}
                  badge={item.badge}
                />
              );
            })}
            <UserAuthButton mounted={mounted} />
          </div>

          {/* Mobile Navigation */}
          <div className="flex h-12 items-center gap-3 lg:hidden">
            <button
              className="flex h-10 w-10 flex-col items-center justify-center rounded-md bg-white/10 outline outline-[2px] outline-white backdrop-blur-2xl focus:outline-none"
              onClick={toggleMenu}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <span className="block h-0.5 w-6 translate-y-0.5 rotate-45 bg-[#A37FBC] transition-all duration-200" />
              ) : (
                <span className="mb-1 block h-0.5 w-6 bg-[#A37FBC] transition-all duration-200" />
              )}
              {menuOpen ? (
                <span className="block h-0.5 w-6 -translate-y-0.5 -rotate-45 bg-[#A37FBC] transition-all duration-200" />
              ) : (
                <span className="mb-1 block h-0.5 w-6 bg-[#A37FBC] transition-all duration-200" />
              )}
              {!menuOpen && (
                <span className="block h-0.5 w-6 bg-[#A37FBC] transition-all duration-200" />
              )}
            </button>
            <UserAuthButton mounted={mounted} />
            <MobileMenu
              isOpen={menuOpen}
              onClose={() => setMenuOpen(false)}
              navItems={navItems}
              styles={styles}
              getMobileLinkClass={getMobileLinkClass}
              menuRef={menuRef}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}
