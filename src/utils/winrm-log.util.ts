/**
 * Strip credentials out of WinRM/SSH helper output before it reaches the logs.
 *
 * The password-reset helper builds PowerShell that carries the new password
 * base64-encoded, and on failure Windows tends to echo the offending command
 * back on stdout/stderr. Passwords are handed to the child process over STDIN
 * precisely so they never appear in argv or a process listing; writing the
 * child's output verbatim into the server log would put them right back on disk.
 *
 * Redacts, in order: the literal secrets involved (plain and base64-encoded),
 * any base64 blob passed to FromBase64String, and the password argument of
 * `net user`.
 */
export function redactWinRmOutput(output: string, secrets: (string | undefined)[] = []): string {
  let safe = output.trim();

  for (const secret of secrets) {
    if (!secret) continue;
    safe = safe.split(secret).join('[REDACTED]');
    // The helper transports the password base64-encoded, so mask that form too.
    const encoded = Buffer.from(secret, 'utf8').toString('base64');
    if (encoded) safe = safe.split(encoded).join('[REDACTED]');
  }

  // Catch-all for credential shapes we were not handed explicitly.
  safe = safe.replace(/FromBase64String\(\s*'[^']*'\s*\)/gi, "FromBase64String('[REDACTED]')");
  safe = safe.replace(/(net\s+user\s+\S+\s+)(?!\/)\S+/gi, '$1[REDACTED]');

  return safe;
}
