"use client";

import { motion, type Variants } from "framer-motion";
import { KeyRound, ShieldCheck, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ============================================================
// Beuro has no customers yet, so it makes no customer claims.
// This section replaced a set of testimonials that put reworded
// quotes from real xAI employees under our own product name.
// Everything below is something the code actually does — if a
// claim here stops being true, delete it or fix the code.
// ============================================================

interface Principle {
  icon: LucideIcon;
  title: string;
  body: string;
}

const PRINCIPLES: Principle[] = [
  {
    icon: Terminal,
    title: "You can watch the work happen",
    body: "Every step a Bot takes is a record of something it actually did — a page it opened, a file it wrote, a source it can hand you. Nothing narrates work it did not do.",
  },
  {
    icon: ShieldCheck,
    title: "One Bot, one identity",
    body: "Each Bot gets its own isolated browser profile and its own logins. A Bot cannot reach into another Bot's sessions, so the boundary between them is real rather than advisory.",
  },
  {
    icon: KeyRound,
    title: "Your credentials stay yours",
    body: "Passwords, 2FA codes, CAPTCHAs and payment confirmations are handed to you, not typed by a model. They never enter the transcript and never reach the LLM.",
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

export function Principles() {
  return (
    <section
      id="principles"
      aria-labelledby="principles-heading"
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
          <motion.p
            variants={item}
            className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500"
          >
            How Beuro works
          </motion.p>
          <motion.h2
            variants={item}
            id="principles-heading"
            className="mt-4 text-balance text-4xl font-medium tracking-tight text-white sm:text-5xl"
          >
            Claims we can show you.
          </motion.h2>
          <motion.p
            variants={item}
            className="mt-5 text-pretty text-base leading-relaxed text-zinc-400"
          >
            Beuro is new and has no customers yet, so there are no quotes here.
            These are the three things the product actually guarantees.
          </motion.p>
        </motion.div>

        <motion.ul
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {PRINCIPLES.map(({ icon: Icon, title, body }) => (
            <motion.li
              key={title}
              variants={item}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-6 transition-colors hover:border-zinc-600"
            >
              <Icon
                aria-hidden="true"
                className="h-5 w-5 text-zinc-400"
                strokeWidth={1.5}
              />
              <h3 className="mt-4 text-base font-medium text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {body}
              </p>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
