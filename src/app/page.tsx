"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  NavBar,
  Hero,
  Features,
  BotJobs,
  Pricing,
  Principles,
  SiteFooter,
} from "@/components/grokbok/landing";
import { AuthPanel, type AuthMode } from "@/components/grokbok/auth";
import { Workspace, useGrokbok } from "@/components/grokbok/workspace";

type RequestedView = "home" | "auth" | "workspace";

export default function Home() {
  const store = useGrokbok();
  const [requested, setRequested] = useState<RequestedView>("home");
  const [authMode, setAuthMode] = useState<AuthMode>("signup");

  // Resolve the session once on first mount.
  useEffect(() => {
    if (!store.authChecked) void store.loadMe();
  }, [store.authChecked, store.loadMe]);

  // Derive the effective view from the request + auth facts (render-time,
  // no sync effects): signed in on the auth screen → workspace;
  // signed out in the workspace → landing.
  let view = requested;
  if (requested === "auth" && store.me) view = "workspace";
  if (requested === "workspace" && store.authChecked && !store.me) view = "home";

  const openWorkspace = () => {
    setAuthMode("signup");
    setRequested(store.me ? "workspace" : "auth");
  };

  const signIn = () => {
    setAuthMode("signin");
    setRequested("auth");
  };

  // Sign-out always returns to the public landing.
  const signOut = () => {
    void store.logout();
    setRequested("home");
  };

  if (view === "auth") {
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
        onBack={() => setRequested("home")}
      />
    );
  }

  if (view === "workspace") {
    return <Workspace onHome={() => setRequested("home")} onSignOut={signOut} />;
  }

  return (
    <main className="flex min-h-screen flex-col bg-black text-zinc-100">
      <NavBar onLaunchWorkspace={openWorkspace} onSignIn={signIn} signedIn={Boolean(store.me)} />
      <Hero onLaunchWorkspace={openWorkspace} />
      <Features />
      <BotJobs />
      <Pricing onLaunchWorkspace={openWorkspace} />
      <Principles />
      <SiteFooter />
    </main>
  );
}
