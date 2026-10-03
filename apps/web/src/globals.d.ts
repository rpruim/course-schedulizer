/** Set in vite.config.ts from the "version" in the root package.json. */
declare const __APP_VERSION__: string;
/** The day the app was built (YYYY-MM-DD). */
declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  /** Application (client) id of the Microsoft app registration; OneDrive features are off without it. */
  readonly VITE_MS_CLIENT_ID?: string;
  /** `organizations` (default), or the tenant id/domain for a single-organization registration. */
  readonly VITE_MS_TENANT?: string;
}
