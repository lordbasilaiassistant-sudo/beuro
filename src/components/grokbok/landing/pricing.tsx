"use client";

import { motion, type Variants } from "framer-motion";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Plan {
  name: string;
  price: string;
  per: string;
  blurb: string;
  features: string[];
  cta: string;
  variant: "solid" | "ghost";
  popular?: boolean;
}

// Beuro is MIT-licensed and self-hosted. There is no plan to sell, so this
// section states what running it actually costs instead of inventing tiers.
// It previously advertised $20/$30/$40 plans with "Get started" buttons and
// features that do not exist ("Beuro's own computer", "Signs into your tools").
const SUBHEADLINE =
  "Beuro is free and open source. You run it yourself, so the only cost is whatever model rail you point it at — and the default rail costs nothing.";

const PLANS: Plan[] = [
  {
    name: "Self-hosted",
    price: "$0",
    per: "",
    blurb: "Clone it, run it, own it. This is the whole product.",
    features: [
      "No account, no API key, no signup",
      "Live web search and real page reads included",
      "Every step cites what it actually opened",
      "Your data never leaves your machine",
      "MIT licensed — fork it, change it, ship it",
    ],
    cta: "Open Workspace",
    variant: "solid",
    popular: true,
  },
  {
    name: "Bring your own model",
    price: "Your rate",
    per: "",
    blurb: "Point it at a provider you control when the free rail is not enough.",
    features: [
      "Any OpenAI-compatible endpoint",
      "Groq, Ollama, vLLM, OpenRouter, z.ai, OpenAI",
      "One env var to switch — no code change",
      "Automatic failover to a second rail",
      "You pay your provider directly. We take nothing.",
    ],
    cta: "Read the setup",
    variant: "ghost",
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

export function Pricing({ onLaunchWorkspace }: { onLaunchWorkspace: () => void }) {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.h2
            id="pricing-heading"
            variants={item}
            className="text-4xl font-semibold leading-[1.08] tracking-tighter text-zinc-100 sm:text-6xl lg:text-7xl"
          >
            It&rsquo;s free.
          </motion.h2>
          <motion.p variants={item} className="mt-5 text-base text-zinc-400 sm:text-lg">
            {SUBHEADLINE}
          </motion.p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mx-auto mt-16 grid max-w-3xl gap-4 sm:grid-cols-2"
        >
          {PLANS.map((plan) => (
            <motion.div
              key={plan.name}
              variants={item}
              aria-label={`${plan.name} plan`}
              className={`relative flex flex-col rounded-2xl border p-6 lg:p-8 ${
                plan.popular
                  ? "border-zinc-500 bg-zinc-900/70"
                  : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-black">
                  Most popular
                </span>
              )}

              <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-400">
                {plan.name}
              </h3>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tighter text-zinc-100 sm:text-5xl">
                  {plan.price}
                </span>
                <span className="text-sm text-zinc-500">{plan.per}</span>
              </div>

              <p className="mt-3 text-sm text-zinc-500">{plan.blurb}</p>

              <ul className="mt-6 space-y-3 text-sm text-zinc-400">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                {plan.variant === "solid" ? (
                  <Button
                    onClick={onLaunchWorkspace}
                    className="h-11 w-full rounded-full bg-white text-black hover:bg-zinc-200"
                  >
                    {plan.cta}
                  </Button>
                ) : (
                  // The ghost CTA had no handler at all — a button that looked
                  // live and did nothing. It reads "Read the setup", so it goes
                  // to the setup docs.
                  <Button
                    asChild
                    variant="ghost"
                    className="h-11 w-full rounded-full border border-zinc-700 text-zinc-200 hover:bg-zinc-900 hover:text-zinc-100"
                  >
                    <a
                      href="https://github.com/lordbasilaiassistant-sudo/beuro#readme"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {plan.cta}
                    </a>
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
