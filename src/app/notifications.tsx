import { supabase } from "@/lib/supabase";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

type NotificationType =
  | "match"
  | "message"
  | "reference"
  | "reference_approved"
  | "like"
  | "system";

type AppNotification = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

type UserRole = "bartender" | "employer";

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(
    null,
  );
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void initializeScreen();
    }, []),
  );

  useEffect(() => {
    if (!authenticatedUserId) {
      return;
    }

    const channel = supabase
      .channel(`notifications-screen-${authenticatedUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${authenticatedUserId}`,
        },
        () => {
          void loadNotifications(authenticatedUserId, false);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authenticatedUserId]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  );

  async function initializeScreen() {
    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD NOTIFICATIONS USER ERROR:", userError);

      router.replace("/(auth)/login");
      return;
    }

    const userId = userData.user.id;

    if (isMountedRef.current) {
      setAuthenticatedUserId(userId);
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.log("LOAD NOTIFICATION USER ROLE ERROR:", profileError);
    }

    const role =
      profileData?.role === "bartender" || profileData?.role === "employer"
        ? profileData.role
        : null;

    if (isMountedRef.current) {
      setUserRole(role);
    }

    await loadNotifications(userId, false);

    if (isMountedRef.current) {
      setLoading(false);
    }
  }

  async function loadNotifications(userId: string, isRefresh: boolean) {
    if (isRefresh && isMountedRef.current) {
      setRefreshing(true);
    }

    const { data, error } = await supabase
      .from("notifications")
      .select(
        `
        id,
        user_id,
        actor_user_id,
        type,
        title,
        body,
        data,
        read_at,
        created_at
        `,
      )
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false,
      })
      .limit(100);

    if (error) {
      console.log("LOAD NOTIFICATIONS ERROR:", error);

      if (isMountedRef.current) {
        setRefreshing(false);
      }

      return;
    }

    if (isMountedRef.current) {
      setNotifications((data ?? []) as AppNotification[]);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    if (!authenticatedUserId) {
      return;
    }

    await loadNotifications(authenticatedUserId, true);
  }

  async function markNotificationAsRead(notificationId: string) {
    const readAt = new Date().toISOString();

    const { error } = await supabase
      .from("notifications")
      .update({
        read_at: readAt,
      })
      .eq("id", notificationId);

    if (error) {
      console.log("MARK NOTIFICATION AS READ ERROR:", error);
      return false;
    }

    if (isMountedRef.current) {
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                read_at: readAt,
              }
            : notification,
        ),
      );
    }

    return true;
  }

  async function markAllAsRead() {
    if (!authenticatedUserId || unreadCount === 0 || actionLoading) {
      return;
    }

    setActionLoading(true);

    const readAt = new Date().toISOString();

    const { error } = await supabase
      .from("notifications")
      .update({
        read_at: readAt,
      })
      .eq("user_id", authenticatedUserId)
      .is("read_at", null);

    if (error) {
      console.log("MARK ALL NOTIFICATIONS AS READ ERROR:", error);

      Alert.alert(
        "Unable to update notifications",
        "Please try again in a moment.",
      );

      if (isMountedRef.current) {
        setActionLoading(false);
      }

      return;
    }

    if (isMountedRef.current) {
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) => ({
          ...notification,
          read_at: notification.read_at ?? readAt,
        })),
      );

      setActionLoading(false);
    }
  }

  async function handleNotificationPress(notification: AppNotification) {
    if (!notification.read_at) {
      await markNotificationAsRead(notification.id);
    }

    const data = notification.data ?? {};

    const matchId =
      typeof data.match_id === "string" ? data.match_id : undefined;

    const bartenderProfileId =
      typeof data.bartender_profile_id === "string"
        ? data.bartender_profile_id
        : undefined;

    const employerProfileId =
      typeof data.employer_profile_id === "string"
        ? data.employer_profile_id
        : undefined;

    const name = typeof data.name === "string" ? data.name : "";
    const photoUrl = typeof data.photo_url === "string" ? data.photo_url : "";

    if (notification.type === "message" && matchId) {
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

    if (notification.type === "match") {
      if (userRole === "bartender") {
        router.push("/(bartender)/matches");
      } else if (userRole === "employer") {
        router.push("/(employer)/matches");
      }

      return;
    }

    if (
      userRole === "employer" &&
      bartenderProfileId &&
      (notification.type === "like" ||
        notification.type === "reference" ||
        notification.type === "reference_approved")
    ) {
      router.push({
        pathname: "/(employer)/bartender/[id]",
        params: {
          id: bartenderProfileId,
        },
      });

      return;
    }

    if (userRole === "bartender" && employerProfileId) {
      router.push({
        pathname: "/(bartender)/employer/[id]",
        params: {
          id: employerProfileId,
        },
      });

      return;
    }

    if (
      notification.type === "reference" ||
      notification.type === "reference_approved"
    ) {
      if (userRole === "bartender") {
        router.push("/(bartender)/references");
      } else if (userRole === "employer") {
        router.push("/(employer)/references");
      }
    }
  }

  function getNotificationIcon(type: NotificationType) {
    if (type === "match") {
      return "🤝";
    }

    if (type === "message") {
      return "💬";
    }

    if (type === "reference" || type === "reference_approved") {
      return "⭐";
    }

    if (type === "like") {
      return "♥";
    }

    return "🔔";
  }

  function formatNotificationDate(dateValue: string) {
    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const now = new Date();
    const differenceMs = now.getTime() - date.getTime();
    const differenceMinutes = Math.floor(differenceMs / 60000);

    if (differenceMinutes < 1) {
      return "Just now";
    }

    if (differenceMinutes < 60) {
      return `${differenceMinutes}m ago`;
    }

    const differenceHours = Math.floor(differenceMinutes / 60);

    if (differenceHours < 24) {
      return `${differenceHours}h ago`;
    }

    const differenceDays = Math.floor(differenceHours / 24);

    if (differenceDays < 7) {
      return `${differenceDays}d ago`;
    }

    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.headerTitle}>Notifications</Text>

        <View style={styles.headerAction}>
          {unreadCount > 0 ? (
            <Pressable
              onPress={markAllAsRead}
              disabled={actionLoading}
              hitSlop={8}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#2C2C2C" />
              ) : (
                <Text style={styles.markAllText}>Read all</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          notifications.length === 0 && styles.emptyContent,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#2C2C2C"
          />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔔</Text>

            <Text style={styles.emptyTitle}>No notifications yet</Text>

            <Text style={styles.emptyDescription}>
              New matches, messages and profile activity will appear here.
            </Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <Pressable
              key={notification.id}
              style={({ pressed }) => [
                styles.notificationCard,
                !notification.read_at && styles.unreadNotificationCard,
                pressed && styles.notificationCardPressed,
              ]}
              onPress={() => {
                void handleNotificationPress(notification);
              }}
            >
              <View style={styles.iconContainer}>
                <Text style={styles.cardIcon}>
                  {getNotificationIcon(notification.type)}
                </Text>
              </View>

              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text
                    style={[
                      styles.cardTitle,
                      !notification.read_at && styles.unreadCardTitle,
                    ]}
                  >
                    {notification.title}
                  </Text>

                  {!notification.read_at ? (
                    <View style={styles.unreadDot} />
                  ) : null}
                </View>

                <Text style={styles.cardBody}>{notification.body}</Text>

                <Text style={styles.cardDate}>
                  {formatNotificationDate(notification.created_at)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F4EF",
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingText: {
    marginTop: 12,
    color: "#666666",
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 16,
    backgroundColor: "#F7F4EF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backText: {
    width: 72,
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
  },

  headerTitle: {
    color: "#2C2C2C",
    fontSize: 22,
    fontWeight: "900",
  },

  headerAction: {
    width: 72,
    alignItems: "flex-end",
  },

  markAllText: {
    color: "#2C2C2C",
    fontSize: 13,
    fontWeight: "800",
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  emptyContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  emptyState: {
    alignItems: "center",
    paddingHorizontal: 30,
    paddingBottom: 80,
  },

  emptyIcon: {
    fontSize: 54,
  },

  emptyTitle: {
    marginTop: 16,
    color: "#2C2C2C",
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyDescription: {
    marginTop: 9,
    color: "#777777",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },

  notificationCard: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    backgroundColor: "#FFFFFF",
    padding: 16,
    flexDirection: "row",
  },

  unreadNotificationCard: {
    borderColor: "#C9C0B5",
    backgroundColor: "#FFFEFC",
  },

  notificationCardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },

  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F1EDE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  cardIcon: {
    fontSize: 21,
  },

  cardContent: {
    flex: 1,
  },

  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  cardTitle: {
    flex: 1,
    color: "#444444",
    fontSize: 16,
    fontWeight: "700",
  },

  unreadCardTitle: {
    color: "#2C2C2C",
    fontWeight: "900",
  },

  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginLeft: 9,
    backgroundColor: "#B00020",
  },

  cardBody: {
    marginTop: 5,
    color: "#666666",
    fontSize: 14,
    lineHeight: 20,
  },

  cardDate: {
    marginTop: 9,
    color: "#999999",
    fontSize: 11,
  },
});
