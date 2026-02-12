/**
 * Pure utility functions for anonymizing paths and project names.
 * All anonymization is display-only — no server data is modified.
 */

const OS_USERNAME_PATTERN = /^(\/(?:Users|home))\/[^/]+/

/**
 * Detects the OS username segment in a path and replaces it with a generic placeholder.
 * Preserves everything after the username segment.
 *
 * Examples:
 *   /Users/john/projects/foo  ->  /Users/user/projects/foo
 *   /home/dev/.config         ->  /home/user/.config
 *   /var/log/app              ->  /var/log/app  (unchanged)
 */
export function anonymizePath(path: string): string {
  return path.replace(OS_USERNAME_PATTERN, '$1/user')
}

