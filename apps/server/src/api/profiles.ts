import { randomUUID } from "node:crypto";
import { Elysia, status, t } from "elysia";
import { store } from "../data";
import { prisma, type VpnProfile } from "../db";
import { DEMO, demoCreateProfile, demoDeleteProfile, demoSetProfileAutoConnect, demoUpdateProfile } from "../demo";
import { canonicalIPv4Cidr, ipv4CidrsOverlap, validateAddressPlan } from "../domain/network-address";
import {
  PROFILE_TYPES,
  type ProfileConfig,
  ProfileConfigError,
  type ProfileType,
  parseProfileConfig,
  preserveProfileSecrets,
  profileSummary,
  redactProfileSecrets,
} from "../domain/profile-config";
import { parseJsonList } from "../domain/profile-routes";
import { prismaErrorCode } from "../lib/errors";
import { decryptProfileConfig, encryptProfileConfig } from "../profile-crypto";
import { tunnel } from "../vpn/manager";

// Array.prototype.map widens to T[], which collapses t.Union's inferred type to `never`.
type ProfileTypeLiteral = ReturnType<typeof t.Literal<ProfileType>>;
const profileTypeSchema = t.Union(
  PROFILE_TYPES.map((profileType) => t.Literal(profileType)) as [ProfileTypeLiteral, ...ProfileTypeLiteral[]],
);

const profileBody = t.Object({
  name: t.String({ minLength: 1 }),
  type: profileTypeSchema,
  config: t.Record(t.String(), t.Any()),
  routes: t.Array(t.String(), { default: [] }),
  dnsServers: t.Array(t.String(), { default: [] }),
});

async function routeValidationError(routes: string[], dnsServers: string[], excludeProfileId?: string) {
  const localError = validateAddressPlan(routes, dnsServers);
  if (localError) return localError;
  const profiles = await prisma.vpnProfile.findMany({
    where: excludeProfileId ? { id: { not: excludeProfileId } } : undefined,
  });
  const candidates = [...routes, ...dnsServers.map((server) => `${server}/32`)];
  for (const profile of profiles) {
    const existingRoutes = [
      ...parseJsonList(profile.routes),
      ...parseJsonList(profile.dnsServers).map((server) => `${server}/32`),
    ];
    for (const existingRoute of existingRoutes) {
      if (candidates.some((candidate) => ipv4CidrsOverlap(candidate, existingRoute))) {
        return `Route overlaps with profile "${profile.name}" (${existingRoute})`;
      }
    }
  }
  return null;
}

function publicProfile(p: VpnProfile) {
  const config = decryptProfileConfig(p.config) as Record<string, unknown>;
  return {
    id: p.id,
    name: p.name,
    type: p.type as ProfileType,
    routes: parseJsonList(p.routes),
    dnsServers: parseJsonList(p.dnsServers),
    autoConnect: p.autoConnect,
    createdAt: p.createdAt,
    summary: profileSummary(p.type as ProfileType, config),
  };
}

export const profilesApi = new Elysia()
  .get("/profiles", async () => (await store.profiles()).map(publicProfile))
  .post(
    "/profiles",
    async ({ body }) => {
      let config: ProfileConfig;
      try {
        config = parseProfileConfig(body.type, body.config);
      } catch (error) {
        if (!(error instanceof ProfileConfigError)) throw error;
        return status(422, { error: error.message });
      }
      if (DEMO) return demoCreateProfile(body);
      const routeError = await routeValidationError(body.routes, body.dnsServers);
      if (routeError) return status(422, { error: routeError });
      const created = await prisma.vpnProfile.create({
        data: {
          id: randomUUID(),
          name: body.name,
          type: body.type,
          config: encryptProfileConfig(config),
          routes: JSON.stringify(body.routes.map((route) => canonicalIPv4Cidr(route)!)),
          dnsServers: JSON.stringify(body.dnsServers),
          createdAt: Math.floor(Date.now() / 1000),
        },
      });
      return { id: created.id };
    },
    { body: profileBody },
  )
  .get("/profiles/:id", async ({ params }) => {
    const p = await store.profile(params.id);
    if (!p) return status(404, { error: "profile not found" });
    const config = redactProfileSecrets(decryptProfileConfig(p.config) as Record<string, unknown>);
    return { ...publicProfile(p), config };
  })
  .put(
    "/profiles/:id",
    async ({ params, body }) => {
      if (DEMO)
        return demoUpdateProfile(params.id, body) ? { id: params.id } : status(404, { error: "profile not found" });
      const p = await prisma.vpnProfile.findUnique({
        where: { id: params.id },
      });
      if (!p) return status(404, { error: "profile not found" });
      if (tunnel.isActive(params.id)) return status(409, { error: "Disconnect this profile before editing it" });
      const routeError = await routeValidationError(body.routes, body.dnsServers, params.id);
      if (routeError) return status(422, { error: routeError });
      const old = decryptProfileConfig(p.config) as Record<string, unknown>;
      const candidate = body.type === p.type ? preserveProfileSecrets(body.type, body.config, old) : body.config;
      let config: ProfileConfig;
      try {
        config = parseProfileConfig(body.type, candidate);
      } catch (error) {
        if (!(error instanceof ProfileConfigError)) throw error;
        return status(422, { error: error.message });
      }
      await prisma.vpnProfile.update({
        where: { id: params.id },
        data: {
          name: body.name,
          type: body.type,
          config: encryptProfileConfig(config),
          routes: JSON.stringify(body.routes.map((route) => canonicalIPv4Cidr(route)!)),
          dnsServers: JSON.stringify(body.dnsServers),
        },
      });
      return { id: params.id };
    },
    { body: profileBody },
  )
  .patch(
    "/profiles/:id/autoconnect",
    async ({ params, body }) => {
      if (DEMO)
        return demoSetProfileAutoConnect(params.id, body.enabled)
          ? { ok: true }
          : status(404, { error: "profile not found" });
      try {
        await prisma.vpnProfile.update({
          where: { id: params.id },
          data: { autoConnect: body.enabled },
        });
      } catch (error) {
        if (prismaErrorCode(error) !== "P2025") throw error;
        return status(404, { error: "profile not found" });
      }
      tunnel.setAutoConnect(params.id, body.enabled);
      if (body.enabled) void tunnel.autoConnect(params.id);
      return { ok: true };
    },
    { body: t.Object({ enabled: t.Boolean() }) },
  )
  .delete("/profiles/:id", async ({ params }) => {
    if (DEMO) {
      await tunnel.disconnect(params.id).catch(() => {});
      demoDeleteProfile(params.id);
      return { ok: true };
    }
    if (tunnel.isActive(params.id)) return status(409, { error: "profile is currently connected" });
    await prisma.vpnProfile.delete({ where: { id: params.id } }).catch(() => {});
    await tunnel.forget(params.id);
    return { ok: true };
  });
