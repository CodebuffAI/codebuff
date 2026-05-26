import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";

export default function TestimonialsSection() {
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

  const testimonials = [
    {
      name: "Siddarth Girdhar",
      title: "CEO of Pivot Robotics",
      quote:
        "Vly.ai helps us rapidly iterate web software at a fraction of the cost and time.",
      profileImage: "/Siddarth_Girdhar.jpeg",
      companyImage: "/Pivot_Robotics.png",
      description:
        "Pivot Robotics, an 8-figure YC startup, saved over $20,000 in web development costs using vly.ai",
    },
    {
      name: "Eshani Patel",
      title: "Caltech Student",
      quote:
        "Someone just used vly.ai to win Caltech's Hacktech, one of the most prestigious hackathons in the world",
      profileImage: "/Placeholder.svg",
      companyImage: "/HackTech_Caltech.png",
      description:
        "The winning software was shipped completely on vly.ai in under 36 hours.",
    },
  ];

  const smallTestimonials = [
    {
      name: "Ciso Dave",
      title: "Founder",
      quote:
        "It does what I ask the first time. With Replit I could ask multiple times and nothing changes. Extremely frustrating and costly.",
      profileImage: "/Placeholder.svg",
    },
    {
      name: "Maya Alexander",
      title: "Founder, ISV @ AWS",
      quote: "A game changer for non-technical founders",
      profileImage: "/Maya_Alexander.jpeg",
    },
  ];

  return (
    <motion.div
      id="reviews"
      className="mt-[7vh] px-2 md:px-4"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={containerVariants}
    >
      <div className="mx-auto w-[90vw] md:w-[70vw]">
        <motion.div
          className="flex flex-col items-center justify-start gap-7"
          variants={containerVariants}
        >
          <motion.div
            className="flex w-full flex-col items-start justify-start gap-3.5"
            variants={itemVariants}
          >
            <h2 className="font-serif text-3xl font-normal leading-normal text-black">
              What <span className="text-[#A37FBC]">others</span> are saying
            </h2>
            <div className="flex w-full items-start justify-between">
              <p className="text-lg font-normal leading-tight text-zinc-500">
                From eight-figure CEOs to top hackathon winners!
              </p>
            </div>
          </motion.div>

          <motion.div
            className="grid w-full grid-cols-1 gap-7 lg:grid-cols-3"
            variants={containerVariants}
          >
            {/* Large Testimonials */}
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                className="flex w-full flex-col items-start justify-between gap-4 rounded-[10px] bg-white px-4 py-6 outline outline-1 outline-offset-[-1px] outline-zinc-300 sm:px-6 sm:py-8 md:px-7 md:py-9"
                style={{ willChange: "transform" }}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex w-full flex-col gap-4">
                  <div className="flex items-center justify-start gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-full bg-zinc-300">
                      <Image
                        src={testimonial.profileImage}
                        alt={testimonial.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-start justify-start gap-1">
                      <p className="w-full truncate text-sm font-normal text-zinc-800 md:text-base">
                        {testimonial.name}
                      </p>
                      <p className="w-full truncate text-xs font-normal text-zinc-500 md:text-sm">
                        {testimonial.title}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-normal leading-relaxed text-zinc-800 md:text-base">
                    "{testimonial.quote}"
                  </p>
                </div>

                <div className="flex w-full flex-col gap-4">
                  <div className="relative h-32 w-full overflow-hidden rounded-lg bg-zinc-300 sm:h-40 md:h-44">
                    <Image
                      src={testimonial.companyImage}
                      alt={`${testimonial.name} company`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex w-full items-center justify-center rounded-[5px] bg-[#A37FBC]/10 p-2 outline outline-1 outline-offset-[-1px] outline-[#A37FBC] sm:p-2.5">
                    <p className="text-center text-sm font-normal leading-relaxed text-[#A37FBC] md:text-base">
                      {testimonial.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Small Testimonials Column */}
            <motion.div
              className="flex w-full flex-col items-start justify-start gap-7"
              variants={containerVariants}
            >
              {smallTestimonials.map((testimonial, index) => (
                <motion.div
                  key={index}
                  className="flex min-h-[200px] w-full flex-1 flex-col items-start justify-start gap-4 rounded-[10px] bg-white px-4 py-6 outline outline-1 outline-offset-[-1px] outline-zinc-300 sm:px-6 sm:py-8 md:px-7 md:py-9"
                  style={{ willChange: "transform" }}
                  variants={itemVariants}
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center justify-start gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-full bg-zinc-300">
                      <Image
                        src={testimonial.profileImage}
                        alt={testimonial.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-start justify-start">
                      <p className="w-full truncate text-sm font-normal text-zinc-800 md:text-base">
                        {testimonial.name}
                      </p>
                      <p className="w-full truncate text-xs font-normal text-zinc-500 md:text-sm">
                        {testimonial.title}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-normal leading-relaxed text-zinc-800 md:text-base">
                    "{testimonial.quote}"
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
