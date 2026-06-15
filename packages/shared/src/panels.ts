import { sanitizeDiscordName } from "./naming.js";

export function panelKeyFromName(name: string) {
  return `embed:${sanitizeDiscordName(name)}`;
}
