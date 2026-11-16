"use client";

import { motion } from "motion/react";

export default function Technology() {
  return (
    <div className="flex items-center justify-center py-6 lg:py-24 px-4 lg:px-2">
      <motion.p
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="max-w-3xl text-center text-2xl md:text-4xl font-aleo tracking-tight"
      >
        FastH3 generates a 5-second clip in about 2 seconds on NVIDIA GB200s.
      </motion.p>
    </div>
  );
}
