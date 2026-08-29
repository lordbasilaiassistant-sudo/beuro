"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Check,
  KeyRound,
  PenLine,
  ScanSearch,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActivityKind } from "@/lib/grokbok-types";

const SUBHEADLINE =
  "AI teammates you can give real work to. They have their own computer, work inside tools and apps like you do, and keep working 24/7.";

const FEED_STEPS: { kind: ActivityKind; text: string }[] = [
  { kind: "signin", text: "Signing in to Workspace…" },
  { kind: "read", text: "Reading overnight updates from 4 bots…" },
  { kind: "think", text: "Prioritizing 3 items that need you…" },
  { kind: "write", text: "Drafting your daily brief…" },
  { kind: "done", text: "Done — brief ready." },
];

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  think: Brain,
  signin: KeyRound,
  tool: Wrench,
  read: ScanSearch,
  write: PenLine,
  done: Check,
};

const STEP_INTERVAL_MS = 1500;
const HOLD_TICKS = 3;
const CYCLE_LENGTH = FEED_STEPS.length + HOLD_TICKS;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.21, 0.47, 0.32, 0.98] },
  },
};

export function Hero({ onLaunchWorkspace }: { onLaunchWorkspace: () => void }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setTick((t) => (t + 1) % CYCLE_LENGTH),
      STEP_INTERVAL_MS
    );
    return () => clearInterval(id);
  }, []);

  const visibleCount = Math.min(tick + 1, FEED_STEPS.length);

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden pb-24 pt-36"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06),transparent_65%)] blur-3xl"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center text-center"
        >
          <motion.div variants={item}>
            <Badge
              variant="outline"
              className="rounded-full border-zinc-700 bg-zinc-900/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-300"
            >
              Early beta
            </Badge>
          </motion.div>

          <motion.h1
            id="hero-heading"
            variants={item}
            className="mt-8 max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tighter text-zinc-100 sm:text-6xl lg:text-7xl"
          >
            Your team of{" "}
            <span className="font-serif italic text-zinc-400">
              always-on agents.
            </span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg"
          >
            {SUBHEADLINE}
          </motion.p>

          <motion.div
            variants={item}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Button
              size="lg"
              onClick={onLaunchWorkspace}
              className="h-11 rounded-full bg-white px-6 text-black hover:bg-zinc-200"
            >
              Open Workspace
              <ArrowRight className="size-4" />
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="h-11 rounded-full px-6 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <a href="#pricing">See pricing</a>
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          variants={item}
          initial="hidden"
          animate="show"
          className="relative mx-auto mt-16 w-full max-w-3xl"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-8 -top-12 h-44 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.07),transparent_65%)] blur-2xl"
          />

          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-2xl shadow-black/60 backdrop-blur">
            <div className="flex items-center justify-between border-b border-zinc-800/60 px-5 py-3.5 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-zinc-700" />
                  <span className="size-2.5 rounded-full bg-zinc-700" />
                  <span className="size-2.5 rounded-full bg-zinc-700" />
                </div>
                <span className="truncate font-mono text-xs text-zinc-500">
                  Computer — Atlas · Chief of Staff
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                  live
                </span>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="min-h-[248px] space-y-2.5 px-5 py-5 font-mono text-[13px] leading-relaxed sm:min-h-[204px] sm:px-6"
            >
              <AnimatePresence initial={false}>
                {FEED_STEPS.slice(0, visibleCount).map((step) => {
                  const Icon = KIND_ICON[step.kind];
                  const isDone = step.kind === "done";
                  return (
                    <motion.div
                      key={step.text}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      className="flex items-center gap-3"
                    >
                      <Icon
                        className={`size-3.5 shrink-0 ${
                          isDone ? "text-emerald-400" : "text-zinc-500"
                        }`}
                      />
                      <span className={isDone ? "text-zinc-100" : "text-zinc-400"}>
                        {step.text}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <div className="flex items-center pl-[26px]">
                <span className="h-3.5 w-1.5 animate-pulse bg-zinc-500" />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800/60 px-5 py-3 sm:px-6">
              <span className="font-mono text-[11px] text-zinc-500">
                5 bots · 3 routines · working 24/7
              </span>
              <span className="font-mono text-[11px] text-zinc-600">early beta</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
