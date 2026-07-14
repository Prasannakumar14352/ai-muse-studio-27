import { createFileRoute, Outlet } from "@tanstack/react-router";

// Parent layout for /_authenticated/admin/*. Children (index, templates,
// integrations, webhooks) render through <Outlet />. The Admin dashboard
// itself lives at admin.index.tsx so it only renders on /admin exactly.
export const Route = createFileRoute("/_authenticated/admin")({
  component: () => <Outlet />,
});
