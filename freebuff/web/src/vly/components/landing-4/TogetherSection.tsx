import React from "react";
import { motion } from "framer-motion";
import { Eye, Heart } from "lucide-react";

export default function TogetherSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0, 0, 0.2, 1] as const,
      },
    },
  };

  const projects = [
    {
      name: "Minecraft",
      author: "FredAgain",
      image: "/minecraft-project.webp",
      views: "14k",
      likes: "3K",
    },
    {
      name: "Minecraft",
      author: "FredAgain",
      image: "/minecraft-project.webp",
      views: "14k",
      likes: "3K",
    },
    {
      name: "Minecraft",
      author: "FredAgain",
      image: "/minecraft-project.webp",
      views: "14k",
      likes: "3K",
    },
  ];

  return (
    <motion.div
      className="mt-24 px-4"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={containerVariants}
    >
      <div className="mx-auto w-full max-w-[1219px]">
        <motion.div
          className="flex flex-col items-start justify-start gap-7"
          variants={containerVariants}
        >
          <motion.div
            className="flex flex-col items-start justify-start gap-3.5"
            variants={itemVariants}
          >
            <h2 className="font-serif text-2xl font-normal leading-loose text-black">
              Together, we can make anything
            </h2>
            <div className="flex w-full items-start justify-between">
              <p className="text-lg font-normal leading-tight text-zinc-500">
                A curated selection of top projects
              </p>
              <button className="text-lg font-semibold leading-tight text-zinc-500 transition-colors hover:text-[#AC697E]">
                Discover More
              </button>
            </div>
          </motion.div>

          <motion.div
            className="grid w-full grid-cols-1 gap-11 md:grid-cols-3"
            variants={containerVariants}
          >
            {projects.map((project, index) => (
              <motion.div
                key={index}
                className="flex flex-col items-start justify-start gap-4"
                style={{ willChange: "transform" }}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <div className="h-52 w-full overflow-hidden rounded-[5px] border border-zinc-100 bg-zinc-300">
                  {index === 2 && (
                    <div className="mx-auto mt-16 h-24 w-24 rounded-lg bg-zinc-400" />
                  )}
                </div>
                <div className="flex w-full flex-col items-start justify-start gap-2">
                  <div className="flex w-full items-start justify-between">
                    <h3 className="text-lg font-semibold leading-tight text-black">
                      {project.name}
                    </h3>
                    <div className="flex items-start justify-start gap-2">
                      <div className="flex items-center justify-start gap-1">
                        <Eye className="h-5 w-5 text-zinc-500" />
                        <span className="text-base font-normal leading-none text-zinc-500">
                          {project.views}
                        </span>
                      </div>
                      <div className="flex items-center justify-start gap-1">
                        <Heart className="h-5 w-5 text-zinc-500" />
                        <span className="text-base font-normal leading-none text-zinc-500">
                          {project.likes}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-base font-normal leading-none text-zinc-500">
                    by {project.author}
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
