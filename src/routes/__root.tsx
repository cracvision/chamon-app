import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="label-mono">404 · not found</p>
        <h1 className="mt-3 text-4xl font-semibold">Off course</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <a href="/" className="mt-6 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:opacity-90">
          Go home
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mission Control — Personal Operations Tracker" },
      { name: "description", content: "Personal operations tracker for managing administrative life-projects." },
      { name: "theme-color", content: "#0a0d14" },
      { property: "og:title", content: "Mission Control — Personal Operations Tracker" },
      { name: "twitter:title", content: "Mission Control — Personal Operations Tracker" },
      { property: "og:description", content: "Personal operations tracker for managing administrative life-projects." },
      { name: "twitter:description", content: "Personal operations tracker for managing administrative life-projects." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f81b59dc-197c-4064-a94a-173e3c3ee134/id-preview-476db94f--c7106989-523d-4ea4-b7ea-95dc72a39c35.lovable.app-1777327309942.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f81b59dc-197c-4064-a94a-173e3c3ee134/id-preview-476db94f--c7106989-523d-4ea4-b7ea-95dc72a39c35.lovable.app-1777327309942.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="dark">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } }
  }));
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <Outlet />
            <Toaster theme="dark" position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
