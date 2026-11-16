"use client";

import { motion } from "motion/react";
import PhoneFrame from "../phone-frame";
import WaitlistForm from "../waitlist-form";

export default function Hero() {
  return (
    <div className="mx-2 md:mx-4 lg:mx-6 mt-24">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative isolate flex flex-col gap-16 md:gap-4 min-[1070px]:flex-row items-center min-[1070px]:justify-between lg:w-[95dvw] mx-auto pt-12 md:px-12 lg:pl-12 xl:pl-20 max-[348px]:h-225 max-[397px]:h-220 h-210 sm:h-204 min-[516px]:h-205  md:h-215 lg:h-250 xl:220 lg:min-h-full overflow-hidden rounded-4xl"
      >
        <motion.div
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute inset-0 -z-10 bg-hero-radial-light dark:bg-hero-radial-dark 
             [--bg-pos:5%] lg:[--bg-pos:5%] 
             [--bg-mid:55%] md:[--bg-mid:45%] 
             [--bg-mid-alt:75%] lg:[--bg-mid-alt:70%]"
        />
        <section className="flex flex-col gap-4 z-10 text-center min-[1070px]:text-left items-center min-[1070px]:items-start 2xl:pl-28 3xl:pl-56 min-[1500px]:!pl-24 min-[1580px]:!pl-40 min-[1729px]:!pl-64 min-[2000px]:!pl-96 min-[2200px]:!pl-120 min-[2350px]:!pl-130 min-[2500px]:!pl-150">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="text-3xl md:text-[2.7rem] xl:text-5xl font-aleo"
          >
            Solve today&apos;s case <br /> inside generated film
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
            className="text-base max-w-lg 4xl:text-2xl 4xl:max-w-3xl"
          >
            A daily mystery on iPhone that you solve in five moves inside a
            live-action scene.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
          >
            <WaitlistForm />
          </motion.div>
        </section>
        <motion.section
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
          className="relative lg:mt-0 min-[1070px]:absolute min-[1070px]:right-10 xl:right-14 2xl:right-40 3xl:right-96 min-[1500px]:!right-24 min-[1629px]:!right-64 min-[2000px]:!right-96 min-[2200px]:!right-120 min-[2350px]:!right-130 min-[2500px]:!right-150 lg:-bottom-6 z-10 mt-7 max-[488px]:mt-10 max-[516px]:mt-17 mt-10 md:mt-7"
        >
          <PhoneFrame
            src="/shots/case-spire.webp"
            alt="A night street scene in Synqui with two glowing outlines, The Spire and The Red Glow, under the question: Do you hear that? Which way?"
            width={402}
            height={874}
            priority
            className="max-w-[17rem] md:max-w-xs xl:max-w-sm"
          />
        </motion.section>
      </motion.div>
    </div>
  );
}
