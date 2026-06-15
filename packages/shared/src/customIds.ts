export type ParsedCustomId = {
  prefix: "rose";
  scope: string;
  action: string;
  id?: string;
  extra?: string[];
};

export function customId(scope: string, action: string, ...parts: Array<string | number | undefined | null>) {
  const clean = parts
    .filter((part): part is string | number => part !== undefined && part !== null && String(part).length > 0)
    .map((part) => encodeURIComponent(String(part)));

  return ["rose", scope, action, ...clean].join(":").slice(0, 100);
}

export function parseCustomId(value: string): ParsedCustomId | null {
  const [prefix, scope, action, id, ...extra] = value.split(":");
  if (prefix !== "rose" || !scope || !action) return null;

  return {
    prefix,
    scope,
    action,
    id: id ? decodeURIComponent(id) : undefined,
    extra: extra.map((part) => decodeURIComponent(part))
  };
}
