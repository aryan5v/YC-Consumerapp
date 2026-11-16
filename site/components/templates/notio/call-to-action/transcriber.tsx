"use client";

import { BatteryFullIcon, SignalHighIcon, WifiIcon } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";

export default function Transcriber() {
  return (
    <div className="w-full max-w-xs md:max-w-sm xl:max-w-md 4xl:max-w-2xl p-[1px] rounded-4xl bg-gradient-to-r from-primary/50 via-secondary/40 to-muted-foreground/20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col gap-2 md:gap-8 w-full bg-gradient-to-b from-background to-zinc-100 dark:to-muted dark:lg:to-neutral-950 rounded-4xl border-0 pb-6 md:pb-8"
      >
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="flex flex-row items-center justify-between py-3 px-8"
        >
          <p className="text-xs md:text-base 4xl:text-2xl">9:41</p>
          <div className="flex flex-row items-center gap-1 md:gap-2">
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            >
              <SignalHighIcon className="w-4 h-4 md:w-6 md:h-6 4xl:w-8 4xl:h-8" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
            >
              <WifiIcon className="w-4 h-4 md:w-6 md:h-6 4xl:w-8 4xl:h-8" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
            >
              <BatteryFullIcon className="w-4 h-4 md:w-6 md:h-6 4xl:w-8 4xl:h-8" />
            </motion.div>
          </div>
        </motion.section>

        <div>
          <motion.section
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
            className="h-3 lg:h-4 4xl:h-6 w-72 lg:w-80 xl:w-100 4xl:w-150 mx-auto bg-muted-foreground/20 dark:bg-neutral-950 rounded-t-full origin-left"
          />

          <div className="flex flex-col gap-4 pt-12 lg:pt-18 dark:bg-muted/50 lg:dark:bg-neutral-950 px-6 md:px-8 rounded-t-4xl">
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="flex flex-col gap-4 lg:gap-8"
            >
              <motion.p
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                className="text-2xl lg:text-4xl 4xl:text-5xl"
              >
                The Last Light
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.4 }}
                className="flex items-center"
              >
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="text-xl lg:text-3xl 4xl:text-4xl text-muted-foreground font-light opacity-80"
                >
                  |
                </motion.span>
                <p className="text-xl lg:text-3xl 4xl:text-4xl text-muted-foreground font-light opacity-80">
                  Tap what glows.
                </p>
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.8, y: 0 }}
                transition={{ delay: 1.1, duration: 0.4 }}
                className="text-muted-foreground text-sm md:text-base lg:text-lg 4xl:text-3xl"
              >
                Five moves to solve it. A wrong answer loses the day.
              </motion.p>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5, ease: "easeOut" }}
              className="relative shadow-2xl rounded-2xl md:rounded-4xl bg-background flex flex-col gap-3 md:gap-4 4xl:gap-20 p-3 md:p-4 min-h-60 md:min-h-72 lg:min-h-85 xl:min-h-90 4xl:min-h-140 overflow-hidden"
            >
              <Image
                src="/shots/case-scene.webp"
                alt="A night street scene in Synqui with two glowing outlines, labelled The Spire and The Red Glow"
                fill
                priority
                sizes="(min-width: 1280px) 448px, 384px"
                className="object-cover object-top"
              />
            </motion.section>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
