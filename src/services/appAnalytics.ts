import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase, supabaseConfigured } from "../lib/supabase";

const INSTALLATION_KEY = "gunx.installation-id.v1";
const APP_VERSION = "0.1.0";

function createInstallationId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export async function registerAppInstallation() {
  if (!supabaseConfigured || !supabase) return;
  try {
    let installationId = await AsyncStorage.getItem(INSTALLATION_KEY);
    if (!installationId) {
      installationId = createInstallationId();
      await AsyncStorage.setItem(INSTALLATION_KEY, installationId);
    }
    const platform = Platform.OS === "android" || Platform.OS === "ios" || Platform.OS === "web"
      ? Platform.OS
      : "other";
    await supabase.rpc("register_app_installation", {
      p_installation_id: installationId,
      p_platform: platform,
      p_app_version: APP_VERSION,
    });
  } catch {
    // Analytics must never block login or business operations.
  }
}

export async function recordSignedInActivity() {
  if (!supabaseConfigured || !supabase) return;
  try {
    await supabase.rpc("record_app_user_activity");
  } catch {
    // Activity tracking is best-effort and never blocks the app.
  }
}
