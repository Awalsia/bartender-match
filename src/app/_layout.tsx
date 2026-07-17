import {
  getNotificationNavigationData,
  registerForPushNotificationsAsync,
} from "@/lib/pushNotifications";
import { supabase } from "@/lib/supabase";
import type { Subscription } from "expo-modules-core";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useEffect, useRef } from "react";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const notificationResponseSubscription = useRef<Subscription | null>(null);
  const authSubscriptionInitialized = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function registerAuthenticatedUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) {
        return;
      }

      const result = await registerForPushNotificationsAsync();

      if (result.status !== "registered") {
        console.log("PUSH REGISTRATION STATUS:", result.status, result.message);
      }
    }

    void registerAuthenticatedUser();

    if (!authSubscriptionInitialized.current) {
      authSubscriptionInitialized.current = true;

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (
          (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
          session?.user
        ) {
          setTimeout(() => {
            void registerForPushNotificationsAsync();
          }, 0);
        }
      });

      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    notificationResponseSubscription.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        navigateFromNotification(response);
      });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        navigateFromNotification(response);
      }
    });

    return () => {
      notificationResponseSubscription.current?.remove();
    };
  }, []);

  function navigateFromNotification(
    response: Notifications.NotificationResponse,
  ) {
    const data = getNotificationNavigationData(response);

    const type = typeof data.type === "string" ? data.type : "";
    const matchId =
      typeof data.match_id === "string" ? data.match_id : undefined;
    const name = typeof data.name === "string" ? data.name : "";
    const photoUrl = typeof data.photo_url === "string" ? data.photo_url : "";

    if (type === "message" && matchId) {
      router.push({
        pathname: "/chat/[matchId]",
        params: {
          matchId,
          name,
          photoUrl,
        },
      });

      return;
    }

    router.push("/notifications");
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
