export type Role = "ADMIN" | "COMMITTEE" | "VENDOR" | "VISITOR";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        id: string;
        role: Role;
        festId?: string;
        name: string;
        email: string;
      };
    }
  }
}

export {};
