"use client";
import { motion } from "motion/react";
import Image from "next/image";
import BlurredOrb from "@/components/blurred-orb";
import { Card } from "@/components/ui/card";

export default function WorldFeature() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative flex flex-col items-center justify-center w-full mx-auto p-6 pb-12 md:px-4 lg:px-20 xl:px-16 md:pb-12 lg:py-8 rounded-4xl mt-15 md:mt-20 lg:mt-0 overflow-hidden max-lg:bg-gradient-to-b max-lg:from-background max-lg:via-background max-lg:dark:via-secondary/30 max-lg:via-secondary/10 max-lg:to-primary/40 max-lg:dark:to-secondary/60"
    >
      <BlurredOrb className="max-lg:hidden absolute left-180 top-120 rounded-full w-full h-280 dark:opacity-40 opacity-10 rotate-45 from-secondary via-primary to-secondary blur-3xl" />
      <div className="flex flex-col lg:flex-row-reverse items-center justify-center gap-12 md:gap-8 xl:gap-24 max-w-7xl">
        <motion.section
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="flex-1 space-y-6 text-center lg:text-left z-10"
        >
          <h2 className="text-2xl md:text-4xl 4xl:text-5xl font-aleo tracking-tight text-foreground">
            A world that keeps <br />
            its own time.
          </h2>
          <p className="text-muted-foreground font-light leading-relaxed max-w-2xl mx-auto lg:mx-0">
            Wander is an open world with weather and a sky that runs from dawn
            to night. Walk up to a landmark and it opens into a filmed scene.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          className="relative flex-1 w-full flex justify-center lg:justify-start isolate rounded-3xl sm:px-4 lg:px-0 lg:mb-8"
        >
          <div className="w-full max-w-sm 4xl:max-w-2xl p-[1px] rounded-3xl bg-gradient-to-r from-primary/40 via-primary/20 to-muted-foreground/10">
            <Card className="w-full min-h-64 lg:min-h-96 4xl:min-h-[60dvh] dark:bg-background backdrop-blur-sm overflow-hidden relative rounded-3xl border-0 ring-0">
              <Image
                src="/shots/world-dusk.webp"
                alt="The Wander world at dusk: a lamp post and trees on a grassy coast under a pale sun"
                fill
                sizes="384px"
                className="object-cover"
              />
          </Card>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}
