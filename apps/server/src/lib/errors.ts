import { Prisma } from "../generated/prisma/client";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function prismaErrorCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}
