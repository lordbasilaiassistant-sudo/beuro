"use client";

import { useState } from "react";
import {
  NavBar,
  Hero,
  Features,
  BotJobs,
  Pricing,
  Testimonials,
  SiteFooter,
} from "@/components/grokbok/landing";
import { Workspace } from "@/components/grokbok/workspace";

type View = "home" | "workspace";

export default function Home() {
  const [view, setView] = useState<View>("home");

  if (view === "workspace") {
    return <Workspace onHome={() => setView("home")} />;
  }

  return (
    <main className="min-h-screen flex flex-col bg-black text-zinc-100">
      <NavBar onLaunchWorkspace={() => setView("workspace")} />
      <Hero onLaunchWorkspace={() => setView("workspace")} />
      <Features />
      <BotJobs />
      <Pricing onLaunchWorkspace={() => setView("workspace")} />
      <Testimonials />
      <SiteFooter />
    </main>
  );
}
