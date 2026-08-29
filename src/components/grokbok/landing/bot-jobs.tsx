"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Bug,
  HeartPulse,
  Megaphone,
  Network,
  Radar,
  Receipt,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

interface BotJob {
  icon: LucideIcon;
  name: string;
  blurb: string;
}

const BOT_JOBS: BotJob[] = [
  {
    icon: Radar,
    name: "Sales Outbound",
    blurb: "Researches accounts and drafts outreach in your voice.",
  },
  {
    icon: Target,
    name: "Talent Scout",
    blurb: "Screens candidates and keeps the pipeline warm.",
  },
  {
    icon: Megaphone,
    name: "Paid Media",
    blurb: "Watches campaigns and reallocates spend daily.",
  },
  {
    icon: Receipt,
    name: "Expense Manager",
    blurb: "Matches receipts, flags anomalies, files reports.",
  },
  {
    icon: TrendingUp,
    name: "Product Performance",
    blurb: "Reads the dashboards and explains the deltas.",
  },
  {
    icon: Bug,
    name: "Bug Reproduction",
    blurb: "Repros issues on staging and files exact tickets.",
  },
  {
    icon: HeartPulse,
    name: "Account Health",
    blurb: "Tracks churn signals across your key accounts.",
  },
  {
    icon: Network,
    name: "Chief of Staff",
    blurb: "Triages everything and delegates to the team.",
  },
];

const HANDOFFS = [
  "Asking Research…",
  "Looping in Comms…",
  "Sending to Chief…",
  "Pinging Travel…",
];

const HANDOFF_INTERVAL_MS = 1300;
const HANDOFF_HOLD_TICKS = 3;
const HANDOFF_CYCLE = HANDOFFS.length + HANDOFF_HOLD_TICKS;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] },
  },
};

export function BotJobs() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setTick((t) => (t + 1) % HANDOFF_CYCLE),
      HANDOFF_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, []);

  const visibleCount = Math.min(tick + 1, HANDOFFS.length);

  return (
    <section id="bots" aria-labelledby="bots-heading" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-3xl"
        >
          <motion.p className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500" variants={item}>
            Meet the team
          </motion.p>
          <motion.h2
            id="bots-heading"
            variants={item}
            className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tighter text-zinc-100 sm:text-6xl lg:text-7xl"
          >
            Give each Bot{" "}
            <span className="text-zinc-400">a job.</span>
          </motion.h2>
          <motion.p variants={item} className="mt-5 text-base text-zinc-400 sm:text-lg">
            Start with a specialist for every lane. One per project — or a whole
            org chart.
          </motion.p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {BOT_JOBS.map((job) => (
            <motion.div
              key={job.name}
              variants={item}
              title={job.blurb}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-600"
            >
              <div className="flex items-center gap-2.5">
                <job.icon className="size-4 shrink-0 text-zinc-300" aria-hidden="true" />
                <h3 className="text-sm font-medium text-zinc-100">{job.name}</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                {job.blurb}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <div
          aria-hidden="true"
          className="mx-auto mt-14 max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 sm:p-6"
        >
          <p className="flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            Bots coordinating
          </p>
          <div className="mt-4 flex min-h-[36px] flex-wrap items-center justify-center gap-2.5">
            <AnimatePresence initial={false}>
              {HANDOFFS.slice(0, visibleCount).map((handoff) => (
                <motion.span
                  key={handoff}
                  initial={{ opacity: 0, scale: 0.9, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 font-mono text-xs text-zinc-300"
                >
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  {handoff}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
