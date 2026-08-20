/**
 * Escape a string for safe interpolation into HTML text/attribute content.
 * Use for any user-controlled value rendered into an email/HTML template
 * (e.g. a display name built from user-supplied first/last name) to prevent
 * HTML/template injection.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
