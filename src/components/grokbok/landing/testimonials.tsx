"use client";

import { motion, type Variants } from "framer-motion";
import { Quote } from "lucide-react";

interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "There is a huge difference between 90% done and 100% done. Most AI gets you almost there. GrokBok finishes the swing, because the work lands where a human would put it — in the actual tool.",
    name: "Roman",
    role: "Product",
  },
  {
    quote:
      "There wasn’t anything to learn. It was just like bringing on a coworker. No automations to set up, no product quirks. You’re just chatting with a friend.",
    name: "Fiona",
    role: "Community",
  },
  {
    quote:
      "Working with GrokBok feels like I have eight arms like an octopus, with every arm in concert.",
    name: "Priya",
    role: "Operations",
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.21, 0.47, 0.32, 0.98] },
  },
};

export function Testimonials() {
  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500" variants={item}>
            Early beta teams
          </motion.p>
          <motion.h2
            id="testimonials-heading"
            variants={item}
            className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tighter text-zinc-100 sm:text-6xl lg:text-7xl"
          >
            Teams run on{" "}
            <span className="text-zinc-400">GrokBok.</span>
          </motion.h2>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 grid gap-4 md:grid-cols-3"
        >
          {TESTIMONIALS.map((testimonial) => (
            <motion.figure
              key={testimonial.name}
              variants={item}
              className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition-colors hover:border-zinc-600"
            >
              <Quote
                className="size-4 fill-current text-zinc-600"
                aria-hidden="true"
              />
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-zinc-200">
                {testimonial.quote}
              </blockquote>
              <figcaption className="mt-6 text-sm text-zinc-500">
                — {testimonial.name}, {testimonial.role}
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
