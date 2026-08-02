// Type-only bridge to the backend's tRPC router. No runtime import — this line is
// erased at compile time, so the mobile bundle never pulls in Fastify/Drizzle/Plaid.
// Once this becomes an npm workspace, replace the relative path with a package import
// (see architecture.md: "Shared types, ideally imported from the backend package").
export type { AppRouter } from '../../backend/src/trpc/router'
