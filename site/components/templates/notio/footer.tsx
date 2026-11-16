"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import WaitlistForm from "./waitlist-form";

export default function Footer() {
  return (
    <footer id="waitlist" className="max-md:relative flex flex-col max-md:px-4 lg:ml-3">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative isolate flex flex-col gap-16 lg:flex-row items-center justify-center w-full mx-auto px-6 py-12 md:p-16 xl:p-20 min-h-[95dvh] md:min-h-[70dvh] rounded-4xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute inset-0 -z-10 rotate-180 rounded-4xl overflow-hidden bg-footer-radial-light lg:dark:bg-footer-radial-dark max-lg:bg-footer-radial-light-mobile max-lg:dark:bg-footer-radial-dark-mobile [--bg-pos-footer:14%] md:[--bg-pos-footer:-5%]"
        />
        <section className="max-md:absolute max-md:bottom-50 max-md:-translate-y-1/2 flex flex-col gap-8 md:gap-4 z-10 text-center items-center">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="text-3xl md:text-5xl font-aleo"
          >
            Tomorrow&apos;s case <br /> is waiting
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
            className="text-base max-w-xs lg:max-w-2xl 4xl:text-3xl"
          >
            Synqui is coming to iPhone through TestFlight. Join the waitlist
            and we&apos;ll send your invite by email.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
          >
            <WaitlistForm />
          </motion.div>
        </section>
      </motion.div>

      <section className="max-md:absolute max-md:bottom-10 max-md:left-1/2 max-md:-translate-x-1/2 flex flex-col gap-8 lg:gap-12 items-center justify-center lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-row items-center gap-2">
            <Image
              src="/logo/synqui-logo.png"
              alt=""
              width={28}
              height={28}
              className="4xl:w-14 4xl:h-14"
            />
            <span className="font-aleo text-2xl leading-none 4xl:text-5xl">Synqui</span>
          </div>
        </motion.div>
        <motion.ul
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="flex gap-6 md:gap-8 text-muted-foreground 4xl:text-2xl"
        >
          <li><Link href="#modes">Modes</Link></li>
          <li><Link href="#technology">Technology</Link></li>
          <li><Link href="#waitlist">Waitlist</Link></li>
        </motion.ul>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
          className="text-muted-foreground text-sm text-center 4xl:text-2xl"
        >
          &copy; {new Date().getFullYear()} Synqui. Built with Capy and Revyl at the YC Consumer Mobile Hackathon.
        </motion.p>
      </section>
    </footer>
  );
}
