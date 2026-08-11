declare module "cloudflare:workers" {
  /** Runtime bindings are injected by the hosting platform. */
  export const env: Record<string, unknown>;
}
