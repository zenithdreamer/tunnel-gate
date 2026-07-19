import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export const STATE_DIR = process.env.STATE_DIR ?? resolve(import.meta.dir, "../../../data");
mkdirSync(STATE_DIR, { recursive: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });

export type { OpenVpnDevice, PortForward, VpnProfile } from "./generated/prisma/client";
