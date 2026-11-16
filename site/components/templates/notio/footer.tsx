"use client";

import { motion } from "motion/react";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="flex flex-col gap-8 items-center justify-center px-4 py-10 lg:py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-row items-center gap-2"
      >
        <Image src="/logo/synqui-logo.png" alt="" width={28} height={28} />
        <span className="font-aleo text-2xl leading-none">Synqui</span>
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        className="text-muted-foreground text-sm text-center"
      >
        Built with Capy, Revyl and Convex at the YC Consumer Mobile Hackathon
      </motion.p>
    </footer>
  );
}
