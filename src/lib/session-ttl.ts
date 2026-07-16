/** Access JWT lifetime (must match signToken). */
export const ACCESS_TOKEN_TTL = "15m";
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

/** Refresh when access token has this long left. */
export const ACCESS_REFRESH_SKEW_MS = 60 * 1000;

/** Opaque refresh token lifetime (httpOnly cookie + MongoDB). */
export const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60;
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SEC * 1000;

/** @deprecated Use ACCESS_TOKEN_TTL — kept for existing imports. */
export const SESSION_TTL = ACCESS_TOKEN_TTL;
/** @deprecated Use ACCESS_TOKEN_TTL_MS */
export const SESSION_TTL_MS = ACCESS_TOKEN_TTL_MS;
