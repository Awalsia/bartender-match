import { supabase } from "@/lib/supabase";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type MatchRow = {
  id: string;
  bartender_user_id: string;
  employer_user_id: string;
  created_at: string;
  bartender_seen_at: string | null;
};

type EmployerProfileRow = {
  id: string;
  user_id: string;
  business_name: string | null;
  city: string | null;
  country: string | null;
  bar_type: string | null;
};

type EmployerPhotoRow = {
  employer_id: string;
  url: string;
  is_cover: boolean | null;
};

type BartenderMatch = {
  matchId: string;
  employerProfileId: string;
  employerUserId: string;
  businessName: string;
  city: string | null;
  country: string | null;
  barType: string | null;
  coverPhotoUrl: string | null;
  createdAt: string;
  isNew: boolean;
};

export default function BartenderMatchesScreen() {
  const [matches, setMatches] = useState<BartenderMatch[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void loadMatches();
    }, []),
  );

  async function loadMatches() {
    setLoading(true);
    setErrorMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD AUTH USER ERROR:", userError);

      router.replace("/(auth)/login");
      return;
    }

    const bartenderUserId = userData.user.id;

    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select(
        `
          id,
          bartender_user_id,
          employer_user_id,
          created_at,
          bartender_seen_at
          `,
      )
      .eq("bartender_user_id", bartenderUserId)
      .order("created_at", { ascending: false });

    if (matchError) {
      console.log("LOAD MATCHES ERROR:", matchError);

      setErrorMessage(matchError.message);
      setLoading(false);
      return;
    }

    const loadedMatches = (matchRows ?? []) as MatchRow[];

    if (loadedMatches.length === 0) {
      setMatches([]);
      setLoading(false);
      return;
    }

    const employerUserIds = loadedMatches.map(
      (match) => match.employer_user_id,
    );

    const { data: profileRows, error: profileError } = await supabase
      .from("employer_profiles")
      .select(
        `
          id,
          user_id,
          business_name,
          city,
          country,
          bar_type
          `,
      )
      .in("user_id", employerUserIds);

    if (profileError) {
      console.log("LOAD MATCHED EMPLOYER PROFILES ERROR:", profileError);

      setErrorMessage(profileError.message);
      setLoading(false);
      return;
    }

    const employerProfiles = (profileRows ?? []) as EmployerProfileRow[];

    const employerProfileIds = employerProfiles.map((profile) => profile.id);

    let employerPhotos: EmployerPhotoRow[] = [];

    if (employerProfileIds.length > 0) {
      const { data: photoRows, error: photoError } = await supabase
        .from("employer_photos")
        .select("employer_id, url, is_cover")
        .in("employer_id", employerProfileIds)
        .eq("is_cover", true);

      if (photoError) {
        console.log("LOAD MATCHED EMPLOYER PHOTOS ERROR:", photoError);
      } else {
        employerPhotos = (photoRows ?? []) as EmployerPhotoRow[];
      }
    }

    const formattedMatches: BartenderMatch[] = loadedMatches.flatMap(
      (match): BartenderMatch[] => {
        const profile = employerProfiles.find(
          (item) => item.user_id === match.employer_user_id,
        );

        if (!profile) {
          return [];
        }

        const coverPhoto = employerPhotos.find(
          (photo) => photo.employer_id === profile.id,
        );

        return [
          {
            matchId: match.id,
            employerProfileId: profile.id,
            employerUserId: profile.user_id,
            businessName: profile.business_name || "Business profile",
            city: profile.city,
            country: profile.country,
            barType: profile.bar_type,
            coverPhotoUrl: coverPhoto?.url ?? null,
            createdAt: match.created_at,
            isNew: match.bartender_seen_at === null,
          },
        ];
      },
    );

    setMatches(formattedMatches);
    setLoading(false);

    await markMatchesAsSeen(bartenderUserId, loadedMatches);
  }

  async function markMatchesAsSeen(
    bartenderUserId: string,
    loadedMatches: MatchRow[],
  ) {
    const unseenMatchIds = loadedMatches
      .filter((match) => match.bartender_seen_at === null)
      .map((match) => match.id);

    if (unseenMatchIds.length === 0) {
      return;
    }

    const { error } = await supabase
      .from("matches")
      .update({
        bartender_seen_at: new Date().toISOString(),
      })
      .in("id", unseenMatchIds)
      .eq("bartender_user_id", bartenderUserId)
      .is("bartender_seen_at", null);

    if (error) {
      console.log("MARK BARTENDER MATCHES AS SEEN ERROR:", error);
    }
  }

  function openEmployerProfile(employerProfileId: string, matchId: string) {
    const route = {
      pathname: "/(bartender)/employer/[id]",
      params: {
        id: employerProfileId,
        source: "matches",
        matchId,
      },
    } as Href;

    router.push(route);
  }

  function formatMatchDate(dateValue: string) {
    return new Date(dateValue).toLocaleDateString();
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading matches...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Your matches</Text>

        <Text style={styles.counter}>{matches.length}</Text>
      </View>

      <Text style={styles.subtitle}>
        Businesses that liked your profile too.
      </Text>

      {errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}

      {matches.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🤝</Text>

          <Text style={styles.emptyTitle}>No matches yet</Text>

          <Text style={styles.emptyText}>
            Keep discovering businesses. When you both like each other, the
            match will appear here.
          </Text>

          <Pressable
            style={styles.discoverButton}
            onPress={() => router.push("/(bartender)/browse")}
          >
            <Text style={styles.discoverButtonText}>Discover businesses</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {matches.map((match) => (
            <Pressable
              key={match.matchId}
              style={({ pressed }) => [
                styles.matchCard,
                match.isNew && styles.newMatchCard,
                pressed && styles.matchCardPressed,
              ]}
              onPress={() =>
                openEmployerProfile(match.employerProfileId, match.matchId)
              }
            >
              <View style={styles.avatarContainer}>
                {match.coverPhotoUrl ? (
                  <Image
                    source={{
                      uri: match.coverPhotoUrl,
                    }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.placeholder}>
                    <Text style={styles.placeholderIcon}>🍸</Text>
                  </View>
                )}

                {match.isNew ? <View style={styles.newDot} /> : null}
              </View>

              <View style={styles.matchInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.matchName}>{match.businessName}</Text>

                  {match.isNew ? (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>NEW</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.matchLocation}>
                  📍 {match.city ?? "City not specified"}
                  {match.country ? `, ${match.country}` : ""}
                </Text>

                {match.barType ? (
                  <Text style={styles.matchType}>🍸 {match.barType}</Text>
                ) : null}

                <Text style={styles.matchDate}>
                  Matched on {formatMatchDate(match.createdAt)}
                </Text>
              </View>

              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F4EF",
  },
  content: {
    padding: 20,
    paddingTop: 54,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  loadingText: {
    marginTop: 12,
    color: "#666666",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backText: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    color: "#2C2C2C",
    fontSize: 25,
    fontWeight: "800",
  },
  counter: {
    color: "#666666",
    fontSize: 16,
    fontWeight: "800",
    minWidth: 40,
    textAlign: "right",
  },
  subtitle: {
    marginTop: 12,
    marginBottom: 22,
    color: "#666666",
    textAlign: "center",
    lineHeight: 21,
  },
  errorMessage: {
    color: "#B00020",
    textAlign: "center",
    marginBottom: 16,
  },
  list: {
    gap: 12,
  },
  matchCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  newMatchCard: {
    borderColor: "#CFC6BA",
    backgroundColor: "#FFFEFC",
  },
  matchCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: "#E5E0D8",
  },
  placeholder: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: {
    fontSize: 32,
  },
  newDot: {
    position: "absolute",
    right: -1,
    bottom: 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#B00020",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  matchInfo: {
    flex: 1,
    marginLeft: 14,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  matchName: {
    flexShrink: 1,
    color: "#2C2C2C",
    fontSize: 19,
    fontWeight: "800",
  },
  newBadge: {
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: "#B00020",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  matchLocation: {
    marginTop: 5,
    color: "#666666",
    fontSize: 14,
  },
  matchType: {
    marginTop: 4,
    color: "#666666",
    fontSize: 13,
  },
  matchDate: {
    marginTop: 7,
    color: "#888888",
    fontSize: 12,
  },
  arrow: {
    color: "#777777",
    fontSize: 32,
    marginLeft: 8,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 28,
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyTitle: {
    marginTop: 14,
    color: "#2C2C2C",
    fontSize: 24,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 10,
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },
  discoverButton: {
    width: "100%",
    marginTop: 24,
    backgroundColor: "#2C2C2C",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  discoverButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
