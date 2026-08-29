import { Badge } from "@/components/ui/badge";

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "GrokBok", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Download", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Careers", href: "#" },
      { label: "News", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "#" },
      { label: "API", href: "#" },
      { label: "Community", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
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
            <p className="mt-4 text-sm leading-relaxed text-zinc-500">
              AI teammates that finish the work.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className={linkClasses}>
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
            © 2026 GrokBok — a tribute clone built for research.
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
