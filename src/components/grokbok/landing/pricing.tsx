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

const SUBHEADLINE =
  "Every plan includes Beuro’s own computer, sign-in to your tools, routines on a schedule, and weekly usage.";

const PLANS: Plan[] = [
  {
    name: "Pro",
    price: "$20",
    per: "/mo",
    blurb: "For individuals delegating their first lane.",
    features: [
      "Beuro’s own computer",
      "Signs into your tools",
      "Routines on a schedule",
      "Weekly Beuro usage included",
      "Work anywhere: desktop, mobile, and more",
    ],
    cta: "Get started",
    variant: "solid",
  },
  {
    name: "Plus",
    price: "$30",
    per: "/mo",
    blurb: "For power users who live in Beuro all day.",
    features: [
      "Everything in Pro",
      "Higher rate limits across all features",
      "Priority access at peak times",
      "Early access to new features",
    ],
    cta: "Get started",
    variant: "solid",
    popular: true,
  },
  {
    name: "Teams",
    price: "$40",
    per: "/seat/mo",
    blurb: "For companies running a whole org chart of bots.",
    features: [
      "Everything in Plus",
      "Centralized team billing and settings",
      "Team marketplace for skills and plugins",
      "Shared usage analytics",
    ],
    cta: "Contact sales",
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
            Pricing
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
          className="mx-auto mt-16 grid max-w-5xl gap-4 lg:grid-cols-3"
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
                <span className="text-5xl font-semibold tracking-tighter text-zinc-100">
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
                  <Button
                    variant="ghost"
                    className="h-11 w-full rounded-full border border-zinc-700 text-zinc-200 hover:bg-zinc-900 hover:text-zinc-100"
                  >
                    {plan.cta}
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
