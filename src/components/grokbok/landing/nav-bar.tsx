"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";

// Every link points at a section that exists. The previous list had six
// entries for four targets — "Developers" and "News" were filler that
// duplicated other anchors, and two pointed at a section we removed.
const NAV_LINKS = [
  { label: "Product", href: "#features" },
  { label: "Bot jobs", href: "#bots" },
  { label: "How it works", href: "#principles" },
  { label: "Pricing", href: "#pricing" },
];

const linkClasses =
  "rounded-sm text-sm text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500";

export function NavBar({
  onLaunchWorkspace,
  onSignIn,
  signedIn = false,
}: {
  onLaunchWorkspace: () => void;
  onSignIn: () => void;
  signedIn?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-800/60 bg-black/70 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6"
      >
        <a
          href="#"
          aria-label="GrokBok home"
          className="flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        >
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-[6px] bg-white"
          >
            <span className="size-2 rounded-full bg-black" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-100">
            GrokBok
          </span>
        </a>

        <ul className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <a href={link.href} className={linkClasses}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          {!signedIn && (
            <Button
              variant="ghost"
              onClick={onSignIn}
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Sign in
            </Button>
          )}
          <Button
            onClick={onLaunchWorkspace}
            className="rounded-full bg-white text-black hover:bg-zinc-200"
          >
            {signedIn ? "Open Workspace" : "Get Started"}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </nav>

      {open && (
        <div
          id="mobile-nav"
          className="border-t border-zinc-800/60 bg-black/95 backdrop-blur-md md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-4 sm:px-6">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-zinc-800/60 pt-4">
              {!signedIn && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setOpen(false);
                    onSignIn();
                  }}
                  className="justify-start text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  Sign in
                </Button>
              )}
              <Button
                onClick={() => {
                  setOpen(false);
                  onLaunchWorkspace();
                }}
                className="w-full rounded-full bg-white text-black hover:bg-zinc-200"
              >
                {signedIn ? "Open Workspace" : "Get Started"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
