import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$page")({
  beforeLoad: ({ params }) => {
    if (params.page === "index") throw redirect({ to: "/" });
    throw notFound();
  },
});
