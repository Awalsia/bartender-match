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

type BartenderProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  country: string | null;
  years_experience: number | null;
  hourly_rate: number | null;
  currency: string | null;
  bio: string | null;
};

type MatchIdRow = {
  id: string;
};

type BartenderSkillCountRow = {
  skill_id: string;
};

type BartenderExperienceCountRow = {
  id: string;
};

export default function BartenderHomeScreen() {
  const [profile, setProfile] = useState<BartenderProfile | null>(null);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(
    null,
  );

  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unseenMatchesCount, setUnseenMatchesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  const [skillsCount, setSkillsCount] = useState(0);
  const [experiencesCount, setExperiencesCount] = useState(0);

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
      .channel(`bartender-home-notifications-${authenticatedUserId}`)
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
      .from("bartender_profiles")
      .select(
        `
        id,
        first_name,
        last_name,
        city,
        country,
        years_experience,
        hourly_rate,
        currency,
        bio
        `,
      )
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      console.log("LOAD BARTENDER PROFILE ERROR:", error);

      router.replace("/(bartender)/complete-profile");
      return;
    }

    const loadedProfile = data as BartenderProfile;

    if (!isMountedRef.current) {
      return;
    }

    setProfile(loadedProfile);

    await Promise.all([
      loadUnreadMessagesCount(userId),
      loadUnseenMatchesCount(userId),
      loadUnreadNotificationsCount(userId),
      loadProfileDetailsCounts(loadedProfile.id),
    ]);

    if (isMountedRef.current) {
      setLoading(false);
    }
  }

  async function loadUnreadMessagesCount(userId: string) {
    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select("id")
      .eq("bartender_user_id", userId);

    if (matchError) {
      console.log("LOAD BARTENDER MATCH IDS ERROR:", matchError);

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
      console.log("LOAD BARTENDER UNREAD COUNT ERROR:", error);

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
      .eq("bartender_user_id", userId)
      .is("bartender_seen_at", null);

    if (error) {
      console.log("LOAD BARTENDER UNSEEN MATCHES ERROR:", error);

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
      console.log("LOAD BARTENDER NOTIFICATIONS COUNT ERROR:", error);

      if (isMountedRef.current) {
        setUnreadNotificationsCount(0);
      }

      return;
    }

    if (isMountedRef.current) {
      setUnreadNotificationsCount(count ?? 0);
    }
  }

  async function loadProfileDetailsCounts(bartenderId: string) {
    const [skillsResponse, experiencesResponse] = await Promise.all([
      supabase
        .from("bartender_skills")
        .select("skill_id")
        .eq("bartender_id", bartenderId),

      supabase
        .from("bartender_experiences")
        .select("id")
        .eq("bartender_id", bartenderId),
    ]);

    if (skillsResponse.error) {
      console.log("LOAD BARTENDER SKILLS COUNT ERROR:", skillsResponse.error);

      if (isMountedRef.current) {
        setSkillsCount(0);
      }
    } else {
      const skills = (skillsResponse.data ?? []) as BartenderSkillCountRow[];

      if (isMountedRef.current) {
        setSkillsCount(skills.length);
      }
    }

    if (experiencesResponse.error) {
      console.log(
        "LOAD BARTENDER EXPERIENCES COUNT ERROR:",
        experiencesResponse.error,
      );

      if (isMountedRef.current) {
        setExperiencesCount(0);
      }
    } else {
      const experiences = (experiencesResponse.data ??
        []) as BartenderExperienceCountRow[];

      if (isMountedRef.current) {
        setExperiencesCount(experiences.length);
      }
    }
  }

  function openNotifications() {
    router.push("/notifications");
  }

  function openReferences() {
    router.push("/(bartender)/references");
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

  const fullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Bartender";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <View style={styles.welcomeContent}>
          <Text style={styles.welcome}>Welcome back,</Text>

          <Text style={styles.name}>{fullName}</Text>
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

      {profile ? <CoverPhoto profileId={profile.id} role="bartender" /> : null}

      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.push("/(bartender)/manage-photos")}
      >
        <Text style={styles.primaryButtonText}>Manage media</Text>
      </Pressable>

      <View style={styles.profileCard}>
        <Text style={styles.cardTitle}>Your bartender profile</Text>

        <Text style={styles.info}>
          📍 {profile?.city || "City not specified"}
          {profile?.country ? `, ${profile.country}` : ""}
        </Text>

        <Text style={styles.info}>
          ⭐ {profile?.years_experience ?? 0}{" "}
          {profile?.years_experience === 1 ? "year" : "years"} of experience
        </Text>

        <Text style={styles.info}>
          💰 {profile?.hourly_rate ?? "Not set"} {profile?.currency ?? "NOK"}
          /hour
        </Text>

        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>Profile details</Text>

        <Text style={styles.sectionHeaderDescription}>
          Complete your professional profile.
        </Text>
      </View>

      <NavigationCard
        emoji="🧰"
        title="Skills"
        description={
          skillsCount > 0
            ? `${skillsCount} ${
                skillsCount === 1 ? "skill selected" : "skills selected"
              }.`
            : "Add your cocktail, service and hospitality skills."
        }
        linkText="Manage skills →"
        smallBadgeText={skillsCount > 0 ? String(skillsCount) : undefined}
        onPress={() => router.push("/(bartender)/edit-skills")}
      />

      <NavigationCard
        emoji="💼"
        title="Work experience"
        description={
          experiencesCount > 0
            ? `${experiencesCount} ${
                experiencesCount === 1
                  ? "experience added"
                  : "experiences added"
              }.`
            : "Add previous bars, restaurants and hospitality roles."
        }
        linkText="Manage experience →"
        smallBadgeText={
          experiencesCount > 0 ? String(experiencesCount) : undefined
        }
        onPress={() => router.push("/(bartender)/experiences")}
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>Opportunities</Text>

        <Text style={styles.sectionHeaderDescription}>
          Discover businesses and manage your connections.
        </Text>
      </View>

      <NavigationCard
        emoji="🔍"
        title="Find your next shift"
        description="Browse bars and businesses looking for bartenders."
        linkText="Discover businesses →"
        onPress={() => router.push("/(bartender)/browse")}
      />

      <NavigationCard
        emoji="🤝"
        title="Your matches"
        description="See businesses that liked your profile too."
        linkText="View matches →"
        badgeCount={unseenMatchesCount}
        onPress={() => router.push("/(bartender)/matches")}
      />

      <NavigationCard
        emoji="💬"
        title="Messages"
        description="Continue your conversations with your matches."
        linkText="Open messages →"
        badgeCount={unreadMessagesCount}
        onPress={() => router.push("/(bartender)/messages")}
      />

      <NavigationCard
        emoji="⭐"
        title="References"
        description="View references and reviews received from businesses."
        linkText="View references →"
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
  smallBadgeText?: string;
  onPress: () => void;
};

function NavigationCard({
  emoji,
  title,
  description,
  linkText,
  badgeCount = 0,
  smallBadgeText,
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

          {!badgeCount && smallBadgeText ? (
            <View style={styles.smallBadge}>
              <Text style={styles.smallBadgeText}>{smallBadgeText}</Text>
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
    marginBottom: 8,
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

  sectionHeader: {
    marginTop: 22,
    marginBottom: 12,
  },

  sectionHeaderTitle: {
    color: "#2C2C2C",
    fontSize: 21,
    fontWeight: "800",
  },

  sectionHeaderDescription: {
    marginTop: 4,
    color: "#777777",
    fontSize: 13,
    lineHeight: 19,
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

  smallBadge: {
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    marginLeft: 8,
    paddingHorizontal: 7,
    backgroundColor: "#EEE9E2",
    alignItems: "center",
    justifyContent: "center",
  },

  smallBadgeText: {
    color: "#5F5A54",
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
    marginTop: 12,
    alignItems: "center",
  },

  logoutText: {
    color: "#B00020",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
