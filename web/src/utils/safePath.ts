/**
 * A same-origin in-app path: a single leading "/" (so no "//host", no "https://…", no
 * "javascript:", no backslash tricks) and no whitespace. Used before following any
 * server- or push-supplied deep link.
 */
export function isSafeInAppPath(path: unknown): path is string {
  return typeof path === "string" && /^\/(?![/\\])[^\s]*$/.test(path);
}
