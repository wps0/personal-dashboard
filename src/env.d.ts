/**
 * @fileoverview What the build adds to import.meta.env (vite.config.ts).
 */

interface ImportMetaEnv {
  /** The commit the app was built from (its full hash), or '' if unknown. */
  readonly APP_COMMIT: string;
  /** When the app was built, as an ISO 8601 timestamp (UTC). */
  readonly APP_BUILT_AT: string;
  /** The repository's page on GitHub, or '' when built elsewhere. */
  readonly APP_SOURCE_URL: string;
}
