import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

const handleRequest = createServerOnlyFn(async (request: Request, splat: string) => {
  const { handle } = await import("@/server/router.server");
  return handle(request, splat);
});

const run = async ({ request, params }: { request: Request; params: { _splat?: string } }) =>
  handleRequest(request, params._splat ?? "");

export const Route = createFileRoute("/api/public/$")({
  server: {
    handlers: {
      GET: run,
      POST: run,
      PUT: run,
      DELETE: run,
    },
  },
});
