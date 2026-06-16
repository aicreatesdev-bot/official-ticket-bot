import { sanitizeDiscordName } from "./naming.js";

export function panelKeyFromName(name: string) {
  return sanitizeDiscordName(name);
}
