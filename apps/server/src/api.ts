import { Elysia } from "elysia";
import { forwardsApi } from "./api/forwards";
import { networkSystemApi } from "./api/network-system";
import { openVpnServerApi } from "./api/openvpn-server";
import { profilesApi } from "./api/profiles";
import { tunnelsApi } from "./api/tunnels";
import { getSession } from "./auth";

export const api = new Elysia({ prefix: "/api" })
  .onBeforeHandle(async ({ request, set }) => {
    const session = await getSession(request);
    if (!session) {
      set.status = 401;
      return { error: "unauthorized" };
    }
  })
  .use(profilesApi)
  .use(tunnelsApi)
  .use(forwardsApi)
  .use(openVpnServerApi)
  .use(networkSystemApi);
