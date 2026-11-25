export const ROLES = ['owner', 'trader', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'orders:place',
  'orders:cancel',
  'orders:read',
  'accounts:read',
  'marketdata:read',
  'members:manage',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: ALL,
  trader: ['orders:place', 'orders:cancel', 'orders:read', 'accounts:read', 'marketdata:read'],
  viewer: ['orders:read', 'accounts:read', 'marketdata:read'],
};

export const hasPermission = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);
