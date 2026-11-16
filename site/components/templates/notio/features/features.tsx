"use client";

import { FeatureCardProps } from "@/types/components/feature";
import { Compass, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import FeatureCard from "./feature-card";
import ToolFeature from "./tool-feature";
import TranscriptionFeature from "./transcription-feature";
import WorldFeature from "./world-feature";
export default function Features() {
  const features: FeatureCardProps[] = [
    {
      title: "Today's case",
      description:
        "One case opens each day with a single question. You get five moves inside the scene, then you solve it.",
      icon: Search,
    },
    {
      title: "Dream a world",
      description:
        "Type a prompt and watch it become a clip in seconds.",
      icon: Sparkles,
    },
    {
      title: "Wander",
      description:
        "An open world with weather, day and night. Its landmarks open into filmed scenes.",
      icon: Compass,
    },
  ];

  return (
    <div id="modes" className="flex flex-col gap-8 items-center justify-center p-4 scroll-mt-28">
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-3xl md:text-4xl 4xl:text-6xl font-aleo text-center"
      >
        Three ways into the film
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
        className="text-lg text-center max-w-2xl text-muted-foreground 4xl:text-3xl 4xl:max-w-6xl"
      >
        Play the day&apos;s case, dream up a scene of your own, or walk an
        open world. A voice game master runs the story, and you can answer it
        out loud.
      </motion.p>
      <section className="flex flex-wrap items-stretch justify-center gap-4 max-md:pt-8 md:gap-8">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            className="flex"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
              duration: 0.5,
              delay: 0.2 + index * 0.15,
              ease: "easeOut",
            }}
          >
            <FeatureCard feature={feature} />
          </motion.div>
        ))}
      </section>
      <ToolFeature />
      <TranscriptionFeature />
      <WorldFeature />
    </div>
  );
}
