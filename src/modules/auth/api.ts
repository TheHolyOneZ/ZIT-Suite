import { commands, unwrap, type Session } from "@/core/ipc";
import { queryClient } from "@/core/query";
import { useSession } from "@/core/store/session";

function applySession(session: Session) {
  const prev = useSession.getState().session?.active;
  useSession.getState().setSession(session);
  if (prev !== session.active) {


    queryClient.removeQueries();
  }
}

export async function loadSession() {
  applySession(await commands.authSession());
}

export async function signInWithToken(token: string) {
  await unwrap(commands.authSignInPat(token));
  await loadSession();
  useSession.getState().setAddingAccount(false);
}

export async function completeDeviceLogin() {
  await loadSession();
  useSession.getState().setAddingAccount(false);
}

export async function switchAccount(accountId: string) {
  applySession(await unwrap(commands.authSwitch(accountId)));
}

export async function signOut(accountId: string) {
  applySession(await unwrap(commands.authSignOut(accountId)));
}

export const RECOMMENDED_SCOPES = ["repo", "delete_repo", "workflow", "read:org", "notifications", "gist", "admin:repo_hook"];

export const NEW_TOKEN_URL = `https://github.com/settings/tokens/new?description=ZIT-Suite&scopes=${RECOMMENDED_SCOPES.join(",")}`;


export function missingScopes(scopes: string[] | null, required: string[]): string[] | null {
  if (!scopes) return null;
  const has = (s: string) => scopes.includes(s) || (s.startsWith("read:") && scopes.includes(s.replace("read:", "admin:")));
  return required.filter((s) => !has(s));
}
