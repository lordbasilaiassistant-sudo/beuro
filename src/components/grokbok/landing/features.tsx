"use client";

import { motion, type Variants } from "framer-motion";
import {
  CheckCheck,
  Cpu,
  GraduationCap,
  MessageSquare,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Cpu,
    title: "Work you can check",
    description:
      "A Bot’s log is written by the tools it ran, not by the model. Every step it claims carries the source it came from, so “I looked it up” is something you can click.",
  },
  {
    icon: MessageSquare,
    title: "Message them like teammates",
    description:
      "Text a Bot from desktop or mobile the way you’d message a coworker. Pick up the same thread later on any surface.",
  },
  {
    icon: CheckCheck,
    title: "100% done, not 90%",
    description:
      "The work lands where a human would put it — in the actual tool. Bots finish the swing and come back only when your judgment is needed.",
  },
  {
    icon: Users,
    title: "A small team, in parallel",
    description:
      "Run a chief of staff with specialists for every lane. Bots message each other, pass work, and stay aligned without you as the middleman.",
  },
  {
    icon: GraduationCap,
    title: "Show it once. Runs forever.",
    description:
      "Complete a workflow once while your Bot watches. It saves the routine and runs it on a schedule from then on.",
  },
  {
    icon: Sparkles,
    title: "Gets sharper every day",
    description:
      "Bots remember how you like things done, update their own memory, and learn from each other.",
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] },
  },
};

export function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-3xl"
        >
          <motion.p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500" variants={item}>
            Why GrokBok is different
          </motion.p>
          <motion.h2
            id="features-heading"
            variants={item}
            className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tighter text-zinc-100 sm:text-6xl lg:text-7xl"
          >
            Less like prompting.
            <br />
            <span className="text-zinc-400">More like delegating.</span>
          </motion.h2>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((feature) => (
            <motion.article
              key={feature.title}
              variants={item}
              className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition-colors hover:border-zinc-600"
            >
              <div className="grid size-10 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 transition-colors group-hover:border-zinc-600">
                <feature.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-base font-medium text-zinc-100">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {feature.description}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
