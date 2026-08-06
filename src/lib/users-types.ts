import type { Role } from "./types";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  isSupport: boolean;
  expiresAt: string | null;
  createdAt: string;
  expired: boolean;
};

export type SeatInfo = {
  maxUsers: number;
  used: number;
  remaining: number;
  ownerCount: number;
  supportActive: number;
};
