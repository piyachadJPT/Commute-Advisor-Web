/**
 * Hosts a browser push endpoint can legitimately point at. The sender makes a server-side
 * request to the endpoint a client supplied, so without this list a signed-in user could aim it
 * at any HTTPS address (SSRF). Matching is on the exact host or a subdomain of these.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge, Android
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari, iOS Home Screen apps
  "notify.windows.com", // legacy Edge/WNS
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
