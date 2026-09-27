export type Role = "ADMIN" | "COMMITTEE" | "VENDOR";

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
