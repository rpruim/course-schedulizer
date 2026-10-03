import type { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import type { SharedOpener } from "../remoteOpen";
import { GraphClient, GraphError, type Access } from "./graph";

/**
 * Signing in to Microsoft in the browser (MSAL, authorization-code flow with PKCE, in a popup). There is no
 * server: the site only needs an app registration, whose id is set at build time as VITE_MS_CLIENT_ID.
 * VITE_MS_TENANT is `organizations` (any work or school account, the default), or the directory id/domain
 * when the registration is for one organization only.
 */
const clientId = (import.meta.env.VITE_MS_CLIENT_ID ?? "").trim();
const tenant = (import.meta.env.VITE_MS_TENANT ?? "").trim() || "organizations";

/** Reading needs less than writing; writing is asked for only when someone saves. */
export const SCOPES: Record<Access, string[]> = { read: ["Files.Read.All"], write: ["Files.ReadWrite.All"] };

/** False when this site has no app registration, so OneDrive features stay hidden. */
export const oneDriveConfigured = clientId !== "";

let app: Promise<PublicClientApplication> | undefined;
function msal(): Promise<PublicClientApplication> {
  app ??= (async () => {
    const { PublicClientApplication } = await import("@azure/msal-browser");
    const instance = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenant}`,
        // A page of its own that hands the sign-in result back to this one (see redirect.html).
        redirectUri: new URL("redirect.html", document.baseURI).toString(),
      },
      cache: { cacheLocation: "localStorage" },
    });
    await instance.initialize();
    return instance;
  })();
  return app;
}

export async function signedInAccount(): Promise<AccountInfo | undefined> {
  if (!oneDriveConfigured) return undefined;
  return (await msal()).getAllAccounts()[0];
}

/** Opens Microsoft's sign-in window. Must run from a click, or the browser blocks the window. */
export async function signIn(access: Access = "read"): Promise<AccountInfo> {
  const result = await (await msal()).loginPopup({ scopes: SCOPES[access], prompt: "select_account" });
  return result.account;
}

export async function signOut(): Promise<void> {
  const instance = await msal();
  const account = instance.getAllAccounts()[0];
  if (account) await instance.logoutPopup({ account, postLogoutRedirectUri: new URL("redirect.html", document.baseURI).toString() });
}

/**
 * An access token. With `interactive` false it only uses what is already signed in, and says so (kind "signin")
 * when a person has to click first; with true it may open the sign-in window, so call it from a click.
 */
async function token(access: Access, interactive: boolean): Promise<string> {
  const instance = await msal();
  const account = instance.getAllAccounts()[0];
  const request = { scopes: SCOPES[access], ...(account ? { account } : {}) };
  try {
    if (!account) throw new Error("no account");
    return (await instance.acquireTokenSilent(request)).accessToken;
  } catch (silent) {
    if (!interactive) throw new GraphError("signin", "Sign in with Microsoft to open this file.");
    try {
      return (await instance.acquireTokenPopup({ ...request, ...(account ? {} : { prompt: "select_account" }) })).accessToken;
    } catch (e) {
      const code = (e as { errorCode?: string }).errorCode ?? "";
      if (code === "user_cancelled") throw new GraphError("signin", "Sign-in was cancelled.");
      if (code === "popup_window_error" || code === "empty_window_error") throw new GraphError("signin", "The browser blocked the sign-in window. Allow pop-ups for this site and try again.");
      throw new GraphError("auth", `Could not sign in (${e instanceof Error ? e.message : String(silent)}).`);
    }
  }
}

/** A Graph client for the signed-in person. `interactive` as for `token`. */
export const graphClient = (interactive: boolean) => new GraphClient((access) => token(access, interactive));

/** What opens OneDrive addresses for the app, or undefined when this site has no app registration. */
export const sharedOpener = (interactive: boolean): SharedOpener | undefined => {
  if (!oneDriveConfigured) return undefined;
  const client = graphClient(interactive);
  return (link) => client.openShared(link);
};
