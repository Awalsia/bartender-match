import CoverPhoto from "@/components/profile/CoverPhoto";
import { supabase } from "@/lib/supabase";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

export default function BartenderHomeScreen() {
  const [profile, setProfile] = useState<BartenderProfile | null>(null);

  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const [unseenMatchesCount, setUnseenMatchesCount] = useState(0);

  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, []),
  );

  async function loadHome() {
    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD AUTH USER ERROR:", userError);

      router.replace("/(auth)/login");
      return;
    }

    const authenticatedUserId = userData.user.id;

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
      .eq("user_id", authenticatedUserId)
      .single();

    if (error || !data) {
      console.log("LOAD BARTENDER PROFILE ERROR:", error);

      router.replace("/(bartender)/complete-profile");

      return;
    }

    setProfile(data as BartenderProfile);

    await Promise.all([
      loadUnreadMessagesCount(authenticatedUserId),
      loadUnseenMatchesCount(authenticatedUserId),
    ]);

    setLoading(false);
  }

  async function loadUnreadMessagesCount(authenticatedUserId: string) {
    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select("id")
      .eq("bartender_user_id", authenticatedUserId);

    if (matchError) {
      console.log("LOAD BARTENDER MATCH IDS ERROR:", matchError);

      setUnreadMessagesCount(0);
      return;
    }

    const matches = (matchRows ?? []) as MatchIdRow[];

    if (matches.length === 0) {
      setUnreadMessagesCount(0);
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
      .neq("sender_id", authenticatedUserId)
      .is("read_at", null);

    if (error) {
      console.log("LOAD BARTENDER UNREAD COUNT ERROR:", error);

      setUnreadMessagesCount(0);
      return;
    }

    setUnreadMessagesCount(count ?? 0);
  }

  async function loadUnseenMatchesCount(authenticatedUserId: string) {
    const { count, error } = await supabase
      .from("matches")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("bartender_user_id", authenticatedUserId)
      .is("bartender_seen_at", null);

    if (error) {
      console.log("LOAD BARTENDER UNSEEN MATCHES ERROR:", error);

      setUnseenMatchesCount(0);
      return;
    }

    setUnseenMatchesCount(count ?? 0);
  }

  function openReferences() {
    Alert.alert(
      "References",
      "The references section will be created in the next step.",
    );
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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.welcome}>Welcome back,</Text>

      <Text style={styles.name}>
        {profile?.first_name} {profile?.last_name}
      </Text>

      {profile ? <CoverPhoto profileId={profile.id} role="bartender" /> : null}

      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.push("/(bartender)/manage-photos")}
      >
        <Text style={styles.primaryButtonText}>Manage photos</Text>
      </Pressable>

      <View style={styles.profileCard}>
        <Text style={styles.cardTitle}>Your bartender profile</Text>

        <Text style={styles.info}>
          📍 {profile?.city}, {profile?.country}
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
  welcome: {
    fontSize: 18,
    color: "#666666",
  },
  name: {
    fontSize: 34,
    fontWeight: "800",
    color: "#2C2C2C",
    marginBottom: 16,
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
