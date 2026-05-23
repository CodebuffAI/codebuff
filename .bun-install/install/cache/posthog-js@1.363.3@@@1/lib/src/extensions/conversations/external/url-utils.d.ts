export declare const RESTORE_QUERY_PARAM = "ph_conv_restore";
/**
 * Check if the current domain matches the allowed domains list.
 * Returns true if:
 * - domains is empty or not present (no restriction)
 * - current hostname matches any allowed domain
 */
export declare function isCurrentDomainAllowed(domains: string[] | undefined): boolean;
export declare function getRestoreTokenFromUrl(): string | null;
export declare function clearRestoreTokenFromUrl(): void;
