import type { MemberRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        role: MemberRole;
      };
    }
  }
}

export {};
