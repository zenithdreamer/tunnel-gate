import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const { useSession, signIn, signUp } = authClient;

export const DEMO_AUTH_KEY = "tg-demo-authed";

export async function signOut() {
  if (sessionStorage.getItem(DEMO_AUTH_KEY)) {
    sessionStorage.removeItem(DEMO_AUTH_KEY);
    window.location.reload();
    return;
  }
  return authClient.signOut();
}
