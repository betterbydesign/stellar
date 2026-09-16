import type { AuthConfig } from "convex/server";

const clientId = process.env.WORKOS_CLIENT_ID?.trim();

// An empty provider list deliberately fails closed when the deployment has not
// been configured. The application setup screen handles that state before it
// attempts authenticated Convex calls.
const authConfig = {
  providers: clientId
    ? [
        {
          type: "customJwt" as const,
          issuer: "https://api.workos.com/",
          algorithm: "RS256" as const,
          jwks: `https://api.workos.com/sso/jwks/${clientId}`,
          applicationID: clientId,
        },
        {
          type: "customJwt" as const,
          issuer: `https://api.workos.com/user_management/${clientId}`,
          algorithm: "RS256" as const,
          jwks: `https://api.workos.com/sso/jwks/${clientId}`,
        },
      ]
    : [],
} satisfies AuthConfig;

export default authConfig;
