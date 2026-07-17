import CoverPhoto from "@/components/profile/CoverPhoto";
import { supabase } from "@/lib/supabase";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type EmployerProfile = {
  id: string;
  business_name: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  bar_type: string | null;
  hourly_rate_offered: number | null;
  currency: string | null;
};

type MatchIdRow = {
  id: string;
};

export default function EmployerHomeScreen() {
  const [profile, setProfile] = useState<EmployerProfile | null>(null);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(
    null,
  );

  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unseenMatchesCount, setUnseenMatchesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  const [loading, setLoading] = useState(true);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, []),
  );

  useEffect(() => {
    if (!authenticatedUserId) {
      return;
    }

    const channel = supabase
      .channel(`employer-home-notifications-${authenticatedUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${authenticatedUserId}`,
        },
        () => {
          void loadUnreadNotificationsCount(authenticatedUserId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authenticatedUserId]);

  async function loadHome() {
    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD AUTH USER ERROR:", userError);

      router.replace("/(auth)/login");
      return;
    }

    const userId = userData.user.id;

    setAuthenticatedUserId(userId);

    const { data, error } = await supabase
      .from("employer_profiles")
      .select(
        `
        id,
        business_name,
        city,
        country,
        description,
        bar_type,
        hourly_rate_offered,
        currency
        `,
      )
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      console.log("LOAD EMPLOYER PROFILE ERROR:", error);

      router.replace("/(employer)/complete-profile");
      return;
    }

    if (!isMountedRef.current) {
      return;
    }

    setProfile(data as EmployerProfile);

    await Promise.all([
      loadUnreadMessagesCount(userId),
      loadUnseenMatchesCount(userId),
      loadUnreadNotificationsCount(userId),
    ]);

    if (isMountedRef.current) {
      setLoading(false);
    }
  }

  async function loadUnreadMessagesCount(userId: string) {
    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select("id")
      .eq("employer_user_id", userId);

    if (matchError) {
      console.log("LOAD EMPLOYER MATCH IDS ERROR:", matchError);

      if (isMountedRef.current) {
        setUnreadMessagesCount(0);
      }

      return;
    }

    const matches = (matchRows ?? []) as MatchIdRow[];

    if (matches.length === 0) {
      if (isMountedRef.current) {
        setUnreadMessagesCount(0);
      }

      return;
    }

    const matchIds = matches.map((match) => match.id);

    const { count, error } = await supabase
      .from("messages")
      .select("id", {
        count: "exact",
        head: true,
      })
      .in("match_id", matchIds)
      .neq("sender_id", userId)
      .is("read_at", null);

    if (error) {
      console.log("LOAD EMPLOYER UNREAD COUNT ERROR:", error);

      if (isMountedRef.current) {
        setUnreadMessagesCount(0);
      }

      return;
    }

    if (isMountedRef.current) {
      setUnreadMessagesCount(count ?? 0);
    }
  }

  async function loadUnseenMatchesCount(userId: string) {
    const { count, error } = await supabase
      .from("matches")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("employer_user_id", userId)
      .is("employer_seen_at", null);

    if (error) {
      console.log("LOAD EMPLOYER UNSEEN MATCHES ERROR:", error);

      if (isMountedRef.current) {
        setUnseenMatchesCount(0);
      }

      return;
    }

    if (isMountedRef.current) {
      setUnseenMatchesCount(count ?? 0);
    }
  }

  async function loadUnreadNotificationsCount(userId: string) {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      console.log("LOAD EMPLOYER NOTIFICATIONS COUNT ERROR:", error);

      if (isMountedRef.current) {
        setUnreadNotificationsCount(0);
      }

      return;
    }

    if (isMountedRef.current) {
      setUnreadNotificationsCount(count ?? 0);
    }
  }

  function openNotifications() {
    router.push("/notifications");
  }

  function openReferences() {
    router.push("/(employer)/references");
  }

  async function handleLogout() {
    await supabase.auth.signOut();

    router.replace("/(auth)/login");
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />
      </View>
    );
  }

  const businessName = profile?.business_name || "Business";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <View style={styles.welcomeContent}>
          <Text style={styles.welcome}>Welcome back,</Text>

          <Text style={styles.name}>{businessName}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.notificationButton,
            pressed && styles.notificationButtonPressed,
          ]}
          onPress={openNotifications}
          accessibilityRole="button"
          accessibilityLabel="Open notifications"
        >
          <Text style={styles.notificationIcon}>🔔</Text>

          {unreadNotificationsCount > 0 ? (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadNotificationsCount > 99
                  ? "99+"
                  : unreadNotificationsCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {profile ? <CoverPhoto profileId={profile.id} role="employer" /> : null}

      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.push("/(employer)/manage-photos")}
      >
        <Text style={styles.primaryButtonText}>Manage media</Text>
      </Pressable>

      <View style={styles.profileCard}>
        <Text style={styles.cardTitle}>Your business profile</Text>

        <Text style={styles.info}>🍸 {profile?.bar_type || "Not set"}</Text>

        <Text style={styles.info}>
          📍 {profile?.city || "City not specified"}
          {profile?.country ? `, ${profile.country}` : ""}
        </Text>

        <Text style={styles.info}>
          💰 {profile?.hourly_rate_offered ?? "Not set"}{" "}
          {profile?.currency ?? "NOK"}/hour
        </Text>

        {profile?.description ? (
          <Text style={styles.bio}>{profile.description}</Text>
        ) : null}
      </View>

      <NavigationCard
        emoji="🔍"
        title="Find your next bartender"
        description="Browse available bartender profiles."
        linkText="Discover bartenders →"
        onPress={() => router.push("/(employer)/browse")}
      />

      <NavigationCard
        emoji="🤝"
        title="Your matches"
        description="See bartenders who liked your business too."
        linkText="View matches →"
        badgeCount={unseenMatchesCount}
        onPress={() => router.push("/(employer)/matches")}
      />

      <NavigationCard
        emoji="💬"
        title="Messages"
        description="Continue your conversations with matched bartenders."
        linkText="Open messages →"
        badgeCount={unreadMessagesCount}
        onPress={() => router.push("/(employer)/messages")}
      />

      <NavigationCard
        emoji="⭐"
        title="References"
        description="Create and manage references for bartenders."
        linkText="Manage references →"
        onPress={openReferences}
      />

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </ScrollView>
  );
}

type NavigationCardProps = {
  emoji: string;
  title: string;
  description: string;
  linkText: string;
  badgeCount?: number;
  onPress: () => void;
};

function NavigationCard({
  emoji,
  title,
  description,
  linkText,
  badgeCount = 0,
  onPress,
}: NavigationCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.navigationCard,
        pressed && styles.navigationCardPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.navigationIcon}>
        <Text style={styles.navigationEmoji}>{emoji}</Text>

        {badgeCount > 0 ? (
          <View style={styles.navigationBadge}>
            <Text style={styles.navigationBadgeText}>
              {badgeCount > 99 ? "99+" : badgeCount}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.navigationContent}>
        <View style={styles.navigationTitleRow}>
          <Text style={styles.navigationTitle}>{title}</Text>

          {badgeCount > 0 ? (
            <View style={styles.inlineBadge}>
              <Text style={styles.inlineBadgeText}>
                {badgeCount > 99 ? "99+" : badgeCount}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.navigationDescription}>{description}</Text>

        <Text style={styles.navigationLink}>{linkText}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F4EF",
  },

  content: {
    padding: 24,
    paddingTop: 70,
    paddingBottom: 44,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    alignItems: "center",
    justifyContent: "center",
  },

  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
  },

  welcomeContent: {
    flex: 1,
  },

  welcome: {
    fontSize: 18,
    color: "#666666",
  },

  name: {
    marginTop: 2,
    fontSize: 34,
    fontWeight: "800",
    color: "#2C2C2C",
  },

  notificationButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  notificationButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },

  notificationIcon: {
    fontSize: 23,
  },

  notificationBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    paddingHorizontal: 5,
    backgroundColor: "#B00020",
    borderWidth: 2,
    borderColor: "#F7F4EF",
    alignItems: "center",
    justifyContent: "center",
  },

  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  primaryButton: {
    backgroundColor: "#2C2C2C",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
    marginBottom: 18,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },

  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E0D8",
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2C2C2C",
    marginBottom: 12,
  },

  info: {
    fontSize: 16,
    color: "#444444",
    marginBottom: 8,
  },

  bio: {
    fontSize: 15,
    color: "#666666",
    marginTop: 12,
    lineHeight: 22,
  },

  navigationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    flexDirection: "row",
    alignItems: "center",
  },

  navigationCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },

  navigationIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F1EDE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    position: "relative",
  },

  navigationEmoji: {
    fontSize: 24,
  },

  navigationBadge: {
    position: "absolute",
    right: -6,
    top: -7,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: "#B00020",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  navigationBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  navigationContent: {
    flex: 1,
  },

  navigationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },

  navigationTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#2C2C2C",
  },

  inlineBadge: {
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    marginLeft: 8,
    paddingHorizontal: 6,
    backgroundColor: "#B00020",
    alignItems: "center",
    justifyContent: "center",
  },

  inlineBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },

  navigationDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: "#666666",
    marginTop: 5,
  },

  navigationLink: {
    marginTop: 8,
    color: "#2C2C2C",
    fontWeight: "800",
  },

  logoutButton: {
    marginTop: 10,
    alignItems: "center",
  },

  logoutText: {
    color: "#B00020",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
