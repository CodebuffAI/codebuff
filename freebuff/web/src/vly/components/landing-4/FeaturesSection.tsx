import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";

export default function FeaturesSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
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

  const features = [
    {
      title: "Gorgeous Sites",
      description:
        "Create stunning, interactive websites that actually feel custom.",
      image: "/ph_flower-fill-1.svg",
    },
    {
      title: "Integrate Anything",
      description: "Plug in tools like Notion, OpenAI, and more.",
      image: "/ph_flower-fill-3.svg",
    },
    {
      title: "Built-In Database",
      description:
        "Collect, store, and manage user data with a fully functional backend.",
      image: "/ph_flower-fill-5.svg",
    },
    {
      title: "Secure by Default",
      description:
        "No more manual setup or prompting! Auth is built-in, automatic, and ready-to-go.",
      image: "/ph_flower-fill-4.svg",
    },
    {
      title: "Point & Click",
      description:
        "Want to make small changes? Click to easily contextualize your requests.",
      image: "/pointandclick.svg",
    },
  ];

  return (
    <motion.div
      id="features"
      className="mt-[3vh] px-2 md:px-4"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={containerVariants}
    >
      <div className="mx-auto w-[90vw] md:w-[70vw]">
        <motion.div
          className="flex flex-col items-start justify-start gap-7"
          variants={containerVariants}
        >
          <motion.div
            className="flex w-full flex-col items-start justify-start gap-3.5"
            variants={itemVariants}
          >
            <h2 className="font-serif text-3xl font-normal leading-normal text-black">
              A revolutionary new way to{" "}
              <span className="text-[#A37FBC]">craft websites</span> on the
              Internet
            </h2>
            <div className="mx-auto w-full">
              <div className="flex w-full items-start justify-between">
                <p className="text-lg font-normal leading-tight text-zinc-500">
                  English is the new programming language.
                </p>
                <DiscoverMoreButton />
              </div>
            </div>
          </motion.div>

          <motion.div
            className="grid w-full grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5"
            variants={containerVariants}
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="flex h-full flex-col items-start justify-start gap-4"
                style={{ willChange: "transform" }}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                  <Image
                    src={feature.image}
                    alt={feature.title}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex w-full flex-col items-start justify-start gap-2">
                  <h3 className="text-lg font-semibold leading-tight text-black">
                    {feature.title}
                  </h3>
                  <p className="text-base font-normal leading-tight text-zinc-500">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Discover More Button with CSS-only tooltip
function DiscoverMoreButton() {
  return (
    <div className="group relative flex items-center justify-end">
      <div className="cursor-pointer select-none justify-start font-['Geist'] text-lg font-semibold leading-tight text-[#8A8A8A] transition-colors duration-200 hover:text-[#A37FBC]">
        Read our manifesto
        <div className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white opacity-0 shadow transition-opacity duration-200 group-hover:opacity-100">
          Coming Soon
        </div>
      </div>
    </div>
  );
}
