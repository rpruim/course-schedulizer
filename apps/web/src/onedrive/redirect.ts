import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

// The sign-in window lands here; pass the result to the app window and close.
void broadcastResponseToMainFrame();
