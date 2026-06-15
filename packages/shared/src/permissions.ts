import type { DashboardRole } from "./types.js";

export type GuildPermissionInput = {
  guildOwnerId?: string | null;
  userId: string;
  userRoleIds: string[];
  trustedAdminRoles?: string[] | null;
  staffRoles?: string[] | null;
  managerRoles?: string[] | null;
  allowedCreateRoles?: string[] | null;
  blockedCreateRoles?: string[] | null;
  managePanelRoles?: string[] | null;
  manageTicketRoles?: string[] | null;
};

function intersects(left: string[] | null | undefined, right: string[] | null | undefined) {
  if (!left?.length || !right?.length) return false;
  const set = new Set(left);
  return right.some((value) => set.has(value));
}

export function isGuildOwner(input: GuildPermissionInput) {
  return input.guildOwnerId === input.userId;
}

export function isTrustedAdmin(input: GuildPermissionInput) {
  return isGuildOwner(input) || intersects(input.trustedAdminRoles, input.userRoleIds);
}

export function isSupportManager(input: GuildPermissionInput) {
  return isTrustedAdmin(input) || intersects(input.managerRoles, input.userRoleIds);
}

export function isStaff(input: GuildPermissionInput, categoryStaffRoles: string[] = []) {
  return (
    isSupportManager(input) ||
    intersects(input.staffRoles, input.userRoleIds) ||
    intersects(categoryStaffRoles, input.userRoleIds)
  );
}

export function canManagePanels(input: GuildPermissionInput) {
  return isTrustedAdmin(input) || intersects(input.managePanelRoles, input.userRoleIds);
}

export function canManageTickets(input: GuildPermissionInput, categoryStaffRoles: string[] = []) {
  return (
    isSupportManager(input) ||
    intersects(input.manageTicketRoles, input.userRoleIds) ||
    isStaff(input, categoryStaffRoles)
  );
}

export function canCreateTicket(input: GuildPermissionInput) {
  if (isTrustedAdmin(input)) return true;
  if (intersects(input.blockedCreateRoles, input.userRoleIds)) return false;
  if (input.allowedCreateRoles?.length) return intersects(input.allowedCreateRoles, input.userRoleIds);
  return true;
}

export function dashboardRole(input: GuildPermissionInput): DashboardRole {
  if (isGuildOwner(input)) return "owner";
  if (isTrustedAdmin(input)) return "trusted_admin";
  if (isSupportManager(input)) return "manager";
  if (isStaff(input)) return "staff";
  return "none";
}
