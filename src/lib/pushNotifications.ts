import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PushRegistrationResult =
  | {
      status: "registered";
      token: string;
    }
  | {
      status:
        | "not_authenticated"
        | "not_physical_device"
        | "permission_denied"
        | "missing_project_id"
        | "registration_failed";
      message: string;
    };

function getEasProjectId() {
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;

  if (
    typeof projectId !== "string" ||
    !projectId ||
    projectId === "REPLACE_WITH_YOUR_EAS_PROJECT_ID"
  ) {
    return null;
  }

  return projectId;
}

async function configureAndroidChannel() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("default", {
    name: "Bartinder notifications",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#B00020",
    lockscreenVisibility:
      Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        status: "not_authenticated",
        message: "The user is not authenticated.",
      };
    }

    if (!Device.isDevice) {
      return {
        status: "not_physical_device",
        message:
          "Remote push notifications must be tested on a physical device.",
      };
    }

    await configureAndroidChannel();

    const currentPermissions = await Notifications.getPermissionsAsync();

    let finalStatus = currentPermissions.status;

    if (finalStatus !== "granted") {
      const requestedPermissions =
        await Notifications.requestPermissionsAsync();

      finalStatus = requestedPermissions.status;
    }

    if (finalStatus !== "granted") {
      return {
        status: "permission_denied",
        message: "Notification permission was not granted.",
      };
    }

    const projectId = getEasProjectId();

    if (!projectId) {
      return {
        status: "missing_project_id",
        message:
          "The EAS project ID is missing. Run eas init and place the project ID in app.json.",
      };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const expoPushToken = tokenResponse.data;

    const { error: upsertError } = await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        device_name: Device.deviceName ?? null,
        app_version: Constants.expoConfig?.version ?? null,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: "expo_push_token",
      },
    );

    if (upsertError) {
      console.log("SAVE PUSH TOKEN ERROR:", upsertError);

      return {
        status: "registration_failed",
        message: upsertError.message,
      };
    }

    return {
      status: "registered",
      token: expoPushToken,
    };
  } catch (error) {
    console.log("REGISTER PUSH NOTIFICATIONS ERROR:", error);

    return {
      status: "registration_failed",
      message:
        error instanceof Error
          ? error.message
          : "Push registration failed.",
    };
  }
}

export async function deactivateCurrentDevicePushToken() {
  try {
    const projectId = getEasProjectId();

    if (!projectId || !Device.isDevice) {
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    await supabase
      .from("push_tokens")
      .update({
        is_active: false,
        last_seen_at: new Date().toISOString(),
      })
      .eq("expo_push_token", tokenResponse.data);
  } catch (error) {
    console.log("DEACTIVATE PUSH TOKEN ERROR:", error);
  }
}

export function getNotificationNavigationData(
  response: Notifications.NotificationResponse,
) {
  return response.notification.request.content.data;
}
