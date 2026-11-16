"use client";

import { motion } from "motion/react";
import PhoneFrame from "./phone-frame";

const screenshots = [
  {
    src: "/shots/case-church.webp",
    alt: "A church scene with glowing outlines around a stained-glass window and two figures at a door",
    width: 402,
    height: 874,
    caption: "Tap a glowing outline to choose.",
  },
  {
    src: "/shots/ending.webp",
    alt: "The ending card titled First Light, listing the five choices made",
    width: 402,
    height: 874,
    caption: "The ending lists the path you took.",
  },
  {
    src: "/shots/wander-dusk.webp",
    alt: "The Wander world at dusk: a lamp post and trees on a grassy coast",
    width: 388,
    height: 844,
    caption: "Wander an open world at any hour.",
  },
];

export default function Screenshots() {
  return (
    <section className="flex flex-wrap items-start justify-center gap-12 md:gap-8 p-4">
      {screenshots.map((shot, index) => (
        <motion.figure
          key={shot.src}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{
            duration: 0.5,
            delay: 0.2 + index * 0.15,
            ease: "easeOut",
          }}
          className="flex w-72 max-w-full flex-col items-center gap-6"
        >
          <PhoneFrame
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
          />
          <figcaption className="text-center text-muted-foreground">
            {shot.caption}
          </figcaption>
        </motion.figure>
      ))}
    </section>
  );
}
