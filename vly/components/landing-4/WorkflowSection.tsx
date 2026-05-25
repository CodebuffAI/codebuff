import React from "react";
import { motion } from "framer-motion";

export default function WorkflowSection() {
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

  return (
    <motion.div
      className="mt-20 px-2 md:px-4"
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
            className="flex flex-col items-start justify-start gap-3.5"
            variants={itemVariants}
          >
            <h2 className="font-serif text-2xl font-normal leading-loose text-black">
              We support complex workflows like no other.
            </h2>
            <div className="flex w-full items-start justify-between">
              <p className="text-lg font-normal leading-tight text-zinc-500">
                A multi-agent model that ensures the most cutting-edge
                technology is completing each task.
              </p>
              <button className="text-lg font-semibold leading-tight text-zinc-500 transition-colors hover:text-[#AC697E]">
                Read more about cutting edge tech
              </button>
            </div>
          </motion.div>

          <motion.div className="w-full" variants={itemVariants}>
            <div className="flex h-[510.87px] w-full items-center justify-center rounded-lg bg-gray-200">
              <div className="text-lg text-gray-500">
                Workflow Diagram Placeholder
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
