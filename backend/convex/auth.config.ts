import { AuthConfig } from "convex/server";

// The Clerk app's Frontend API URL, for example https://verb-noun-00.clerk.accounts.dev
// in development or https://clerk.example.com in production. Set it on the
// deployment (`npx convex env set CLERK_JWT_ISSUER_DOMAIN https://...`) and Convex
// verifies every Clerk token against that issuer before `ctx.auth` reports it.
// With no issuer configured the deployment takes no tokens and guests still play.
const issuer = (process.env.CLERK_JWT_ISSUER_DOMAIN ?? process.env.CLERK_FRONTEND_API_URL ?? "").trim();

export default {
  providers:
    issuer === ""
      ? []
      : [
          {
            domain: issuer,
            applicationID: "convex",
          },
        ],
} satisfies AuthConfig;
