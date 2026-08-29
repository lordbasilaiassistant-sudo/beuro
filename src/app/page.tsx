"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  NavBar,
  Hero,
  Features,
  BotJobs,
  Pricing,
  Testimonials,
  SiteFooter,
} from "@/components/grokbok/landing";
import { AuthPanel, type AuthMode } from "@/components/grokbok/auth";
import { Workspace, useGrokbok } from "@/components/grokbok/workspace";

type View = "home" | "auth" | "workspace";

export default function Home() {
  const store = useGrokbok();
  const [view, setView] = useState<View>("home");
  const [authMode, setAuthMode] = useState<AuthMode>("signup");

  // Resolve the session once on first mount.
  useEffect(() => {
    if (!store.authChecked) void store.loadMe();
  }, [store.authChecked, store.loadMe]);

  // "Open Workspace" = sign in if needed, then straight in.
  const openWorkspace = () => {
    if (store.me) {
      setView("workspace");
    } else {
      setAuthMode("signup");
      setView("auth");
    }
  };

  const signIn = () => {
    setAuthMode("signin");
    setView("auth");
  };

  if (view === "auth") {
    if (store.me) {
      // Signed in while on the auth screen → go straight to the workspace.
      return <Workspace onHome={() => setView("home")} />;
    }
    if (!store.authChecked) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-black">
          <Loader2 className="size-5 animate-spin text-zinc-500" />
        </div>
      );
    }
    return (
      <AuthPanel
        store={store}
        initialMode={authMode}
        onBack={() => setView("home")}
      />
    );
  }

  if (view === "workspace") {
    if (!store.me) {
      // Session expired or signed out → back to the gate.
      return (
        <div className="flex min-h-dvh items-center justify-center bg-black">
          <Loader2 className="size-5 animate-spin text-zinc-500" />
        </div>
      );
    }
    return <Workspace onHome={() => setView("home")} />;
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-zinc-100">
      <NavBar onLaunchWorkspace={openWorkspace} onSignIn={signIn} signedIn={Boolean(store.me)} />
      <Hero onLaunchWorkspace={openWorkspace} />
      <Features />
      <BotJobs />
      <Pricing onLaunchWorkspace={openWorkspace} />
      <Testimonials />
      <SiteFooter />
    </main>
  );
}
