import { motion } from "framer-motion";
import Image from "next/image";
import { Check } from "lucide-react";

export default function ComparisonTable() {
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
      id="comparison"
      className="mt-[7vh] px-2 md:px-4"
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
            <h2 className="text-left font-serif text-3xl font-normal leading-normal text-black">
              <span className="text-zinc-800">An </span>
              <span className="text-[#7CFF3F]">AI-first</span>
              <span className="text-zinc-800"> database that </span>
              <span className="text-zinc-800">
                runs laps around the competition
              </span>
            </h2>
            <div className="flex w-full items-start justify-start">
              <p className="text-left text-lg font-normal leading-tight text-zinc-500">
                We've spent years working with advanced realtime DBs and
                backends that are built for AI at scale. Just try us to see the
                difference.
              </p>
            </div>
          </motion.div>

          {/* Comparison Table */}
          <motion.div className="w-full" variants={itemVariants}>
            <div className="w-full overflow-hidden rounded-[20px] border border-zinc-300">
              <div className="grid grid-cols-6 divide-x divide-gray-200">
                {/* Feature Names Column */}
                <div className="col-span-1">
                  {[
                    "Free",
                    "Realtime",
                    "Hosting",
                    "Backend",
                    "Database",
                    "Frontend",
                  ].map((feature) => (
                    <div
                      key={feature}
                      className="flex h-20 items-center justify-center py-5"
                    >
                      <div className="font-['Geist'] text-base font-normal leading-7 text-zinc-800">
                        {feature}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Freebuff Web Column */}
                <div className="col-span-1">
                  {[1, 2, 3, 4, 5, 6].map((_, index) => (
                    <div
                      key={index}
                      className={`flex h-20 items-center justify-center bg-zinc-100 py-5`}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7CFF3F]/10 outline outline-1 outline-offset-[-1px] outline-[#7CFF3F]">
                        <Check className="h-4 w-4 text-[#7CFF3F]" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* bubble.io Column */}
                <div className="col-span-1">
                  {[null, 1, 1, 1, 1, 1].map((value, index) => (
                    <div
                      key={index}
                      className={`h-20 py-5 ${value ? "bg-white/60" : ""} flex items-center justify-center ${index === 1 ? "rounded-tl-[20px] rounded-tr-[20px]" : ""}`}
                    >
                      {value && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7CFF3F]/10 outline outline-1 outline-offset-[-1px] outline-[#7CFF3F]">
                          <Check className="h-4 w-4 text-[#7CFF3F]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* replit Column */}
                <div className="col-span-1">
                  {[null, null, 1, 1, 1, 1].map((value, index) => (
                    <div
                      key={index}
                      className={`h-20 py-5 ${value ? "bg-white/60" : ""} flex items-center justify-center ${index === 2 ? "rounded-tl-[20px] rounded-tr-[20px]" : ""}`}
                    >
                      {value && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7CFF3F]/10 outline outline-1 outline-offset-[-1px] outline-[#7CFF3F]">
                          <Check className="h-4 w-4 text-[#7CFF3F]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* bolt Column */}
                <div className="col-span-1">
                  {[null, null, null, 1, 1, 1].map((value, index) => (
                    <div
                      key={index}
                      className={`h-20 py-5 ${value ? "bg-white/60" : ""} flex items-center justify-center ${index === 3 ? "rounded-tl-[20px] rounded-tr-[20px]" : ""}`}
                    >
                      {value && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7CFF3F]/10 outline outline-1 outline-offset-[-1px] outline-[#7CFF3F]">
                          <Check className="h-4 w-4 text-[#7CFF3F]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* lovable Column */}
                <div className="col-span-1">
                  {[null, null, null, null, null, 1].map((value, index) => (
                    <div
                      key={index}
                      className={`h-20 py-5 ${value ? "bg-white/60" : ""} flex items-center justify-center ${index === 5 ? "rounded-tl-[20px] rounded-tr-[20px]" : ""}`}
                    >
                      {value && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7CFF3F]/10 outline outline-1 outline-offset-[-1px] outline-[#7CFF3F]">
                          <Check className="h-4 w-4 text-[#7CFF3F]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Table Footer */}
              <div className="grid h-20 grid-cols-6 divide-x divide-zinc-300 rounded-bl-[20px] rounded-br-[20px] bg-white/60">
                <div className="col-span-1" />
                {["Freebuff Web", "bubble.io", "replit", "bolt", "lovable"].map(
                  (name, index) => (
                    <div
                      key={name}
                      className={`col-span-1 flex items-center justify-center gap-2 ${index === 0 ? "bg-zinc-100" : ""}`}
                    >
                      {index === 0 && (
                        <Image
                          src="/logo-icon.png"
                          alt="Freebuff Web logo"
                          width={16}
                          height={16}
                          className="object-contain"
                        />
                      )}
                      <div
                        className={`font-['Geist'] text-base font-medium leading-7 ${index === 0 ? "text-zinc-800" : "text-zinc-800"}`}
                      >
                        {name}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </motion.div>

          {/* Disclaimer */}
          <motion.div className="w-full" variants={itemVariants}>
            <p className="text-sm font-normal leading-tight text-gray-400">
              Disclaimer: This comparison is for informational purposes only.
              All trademarks, product names, and company names or logos are the
              property of their respective owners. Feature availability is based
              on publicly available information as of today and may change over
              time. No defamation or disparagement is intended. Contact for
              changes to be made.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
