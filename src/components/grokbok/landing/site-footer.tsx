import { Badge } from "@/components/ui/badge";

const REPO = "https://github.com/lordbasilaiassistant-sudo/beuro";

// Every link here goes somewhere real. The previous footer had nine entries
// pointing at href="#" — Download, About, Careers, News, Docs, API, Community,
// Privacy, Terms — none of which exist. A dead link is worse than a missing
// one: it costs a click to learn there was nothing there.
const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#features" },
      { label: "Bot jobs", href: "#bots" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Source", href: REPO },
      { label: "Read me", href: `${REPO}#readme` },
      { label: "Issues", href: `${REPO}/issues` },
    ],
  },
];

const linkClasses =
  "rounded-sm text-sm text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-800/60 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          <div className="max-w-xs">
            <a
              href="#top"
              aria-label="Beuro home"
              className="flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
            >
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-[6px] bg-white"
              >
                <span className="size-2 rounded-full bg-black" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-zinc-100">
                Beuro
              </span>
            </a>
            <p className="mt-4 text-sm leading-relaxed text-zinc-500">
              AI teammates that show their work, and let you check it.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:gap-16">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.href.startsWith("http")
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className={linkClasses}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-zinc-800/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-600">
            © 2026 Beuro — open source. Bots cite what they actually opened.
          </p>
          <Badge
            variant="outline"
            className="w-fit rounded-full border-zinc-700 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400"
          >
            Early beta
          </Badge>
        </div>
      </div>
    </footer>
  );
}
