import { motion } from "framer-motion";
import { SignedIn, SignedOut } from "@/vly/components/auth/AuthComponents";
import { useRouter } from "next/navigation";

export default function Footer() {
  const router = useRouter();

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - 100; // Account for fixed nav height

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0, 0, 0.2, 1] as const,
      },
    },
  };

  const buttonVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.5,
        ease: [0, 0, 0.2, 1] as const,
      },
    },
  };

  return (
    <motion.footer
      className="relative mt-[127px] w-full overflow-hidden"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={containerVariants}
    >
      {/* Footer-specific background */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img
          src="/landing/bg-footer.webp"
          alt="Footer Background"
          className="h-full w-full object-cover"
          style={{ objectPosition: "center bottom", minHeight: "100vh" }}
        />
      </div>

      <motion.div
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 pb-12 pt-12 sm:px-6 lg:px-8"
        variants={containerVariants}
      >
        <motion.img
          className="relative mt-4 h-12 w-12"
          style={{ willChange: "transform" }}
          src="/favicon.svg"
          alt="Freebuff Web logo"
          variants={itemVariants}
          whileHover={{
            scale: 1.1,
            rotate: 5,
            transition: { duration: 0.2 },
          }}
        />
        <motion.div className="text-center" variants={itemVariants}>
          <motion.span
            className="font-serif text-2xl font-normal text-zinc-800"
            whileHover={{ color: "#7CFF3F" }}
            transition={{ duration: 0.2 }}
          >
            You type. We{" "}
          </motion.span>
          <motion.span
            className="font-serif text-2xl font-normal italic text-zinc-800"
            whileHover={{ color: "#7CFF3F" }}
            transition={{ duration: 0.2 }}
          >
            ship.
          </motion.span>
        </motion.div>

        {/* Footer Links */}
        <motion.nav className="flex gap-x-[10px]" variants={itemVariants}>
          {[
            { name: "Home", action: () => scrollToSection("hero") },
            { name: "Comparison", action: () => scrollToSection("comparison") },
            { name: "Reviews", action: () => scrollToSection("reviews") },
            {
              name: "Privacy",
              action: () => window.open("/web/privacy", "_blank"),
            },
            { name: "Terms", action: () => window.open("/web/terms", "_blank") },
          ].map((link, index) => (
            <motion.button
              key={link.name}
              onClick={link.action}
              className="cursor-pointer font-['Geist'] text-base font-normal text-black transition-colors hover:text-neutral-600"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              whileHover={{
                color: "#7CFF3F",
                y: -2,
                scale: 1.05,
                transition: { duration: 0.2 },
              }}
            >
              {link.name}
            </motion.button>
          ))}
        </motion.nav>

        {/* Action Buttons */}
        <motion.div className="flex gap-5" variants={itemVariants}>
          <SignedOut>
            <motion.button
              onClick={scrollToTop}
              className="rounded-[10px] bg-white/30 px-5 py-2.5 font-['Geist'] text-base font-semibold text-zinc-800 outline outline-[1px] outline-white backdrop-blur-lg"
              style={{ willChange: "transform" }}
              variants={buttonVariants}
              whileHover={{
                scale: 1.05,
                backgroundColor: "rgba(255,255,255,0.01)",
                transition: { duration: 0.2 },
              }}
              whileTap={{ scale: 0.95 }}
            >
              Get Started
            </motion.button>
          </SignedOut>
          <SignedIn>
            <motion.button
              onClick={() => router.push("/web/dashboard")}
              className="rounded-[10px] bg-white/30 px-5 py-2.5 font-['Geist'] text-base font-semibold text-zinc-800 outline outline-[1px] outline-white backdrop-blur-lg"
              style={{ willChange: "transform" }}
              variants={buttonVariants}
              whileHover={{
                scale: 1.05,
                backgroundColor: "rgba(255,255,255,0.01)",
                transition: { duration: 0.2 },
              }}
              whileTap={{ scale: 0.95 }}
            >
              My Projects
            </motion.button>
          </SignedIn>
          <motion.button
            onClick={() =>
              window.open("https://discord.gg/2gSmB9DxJW", "_blank")
            }
            className="rounded-[10px] bg-white/30 px-5 py-2.5 font-['Geist'] text-base font-semibold text-zinc-800 outline outline-[1px] outline-white backdrop-blur-lg"
            style={{ willChange: "transform" }}
            variants={buttonVariants}
            whileHover={{
              scale: 1.05,
              backgroundColor: "rgba(255,255,255,0.01)",
              transition: { duration: 0.2 },
            }}
            whileTap={{ scale: 0.95 }}
          >
            Yap in our Discord
          </motion.button>
        </motion.div>

        {/* Copyright */}
        <motion.div
          className="font-['Geist'] text-base font-normal text-zinc-800"
          variants={itemVariants}
          whileHover={{
            color: "#7CFF3F",
            scale: 1.02,
            transition: { duration: 0.2 },
          }}
        >
          © {new Date().getFullYear()} Freebuff Web. All rights reserved.
        </motion.div>
      </motion.div>
    </motion.footer>
  );
}
