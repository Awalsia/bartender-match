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
};

type BartenderProfileRow = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  country: string | null;
};

type BartenderPhotoRow = {
  bartender_id: string;
  url: string;
};

type ReferenceRow = {
  id: string;
  match_id: string | null;
  rating: number;
  comment: string;
  updated_at: string;
};

type ReferenceCandidate = {
  matchId: string;
  bartenderProfileId: string;
  bartenderUserId: string;
  name: string;
  city: string | null;
  country: string | null;
  photoUrl: string | null;
  referenceId: string | null;
  rating: number | null;
  comment: string | null;
  matchedAt: string;
};

export default function EmployerReferencesScreen() {
  const [candidates, setCandidates] = useState<ReferenceCandidate[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void loadReferences();
    }, []),
  );

  async function loadReferences() {
    setLoading(true);
    setErrorMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.replace("/(auth)/login");
      return;
    }

    const employerUserId = userData.user.id;

    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select(
        `
          id,
          bartender_user_id,
          employer_user_id,
          created_at
          `,
      )
      .eq("employer_user_id", employerUserId)
      .order("created_at", {
        ascending: false,
      });

    if (matchError) {
      setErrorMessage(matchError.message);
      setLoading(false);
      return;
    }

    const matches = (matchRows ?? []) as MatchRow[];

    if (matches.length === 0) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    const bartenderUserIds = matches.map((match) => match.bartender_user_id);

    const matchIds = matches.map((match) => match.id);

    const [profileResponse, referenceResponse] = await Promise.all([
      supabase
        .from("bartender_profiles")
        .select(
          `
          id,
          user_id,
          first_name,
          last_name,
          city,
          country
          `,
        )
        .in("user_id", bartenderUserIds),

      supabase
        .from("references")
        .select(
          `
          id,
          match_id,
          rating,
          comment,
          updated_at
          `,
        )
        .in("match_id", matchIds)
        .eq("author_user_id", employerUserId),
    ]);

    if (profileResponse.error) {
      setErrorMessage(profileResponse.error.message);

      setLoading(false);
      return;
    }

    if (referenceResponse.error) {
      setErrorMessage(referenceResponse.error.message);

      setLoading(false);
      return;
    }

    const profiles = (profileResponse.data ?? []) as BartenderProfileRow[];

    const references = (referenceResponse.data ?? []) as ReferenceRow[];

    const profileIds = profiles.map((profile) => profile.id);

    let photos: BartenderPhotoRow[] = [];

    if (profileIds.length > 0) {
      const { data: photoRows } = await supabase
        .from("bartender_photos")
        .select("bartender_id, url")
        .in("bartender_id", profileIds)
        .eq("is_cover", true);

      photos = (photoRows ?? []) as BartenderPhotoRow[];
    }

    const formattedCandidates: ReferenceCandidate[] = matches.flatMap(
      (match): ReferenceCandidate[] => {
        const profile = profiles.find(
          (item) => item.user_id === match.bartender_user_id,
        );

        if (!profile) return [];

        const photo = photos.find((item) => item.bartender_id === profile.id);

        const reference = references.find((item) => item.match_id === match.id);

        const name =
          [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
          "Bartender";

        return [
          {
            matchId: match.id,
            bartenderProfileId: profile.id,
            bartenderUserId: profile.user_id,
            name,
            city: profile.city,
            country: profile.country,
            photoUrl: photo?.url ?? null,
            referenceId: reference?.id ?? null,
            rating: reference?.rating ?? null,
            comment: reference?.comment ?? null,
            matchedAt: match.created_at,
          },
        ];
      },
    );

    setCandidates(formattedCandidates);
    setLoading(false);
  }

  function openReference(candidate: ReferenceCandidate) {
    const route = {
      pathname: "../(employer)/reference/[matchId]",
      params: {
        matchId: candidate.matchId,
      },
    } as Href;

    router.push(route);
  }

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, index) =>
      index < rating ? "★" : "☆",
    ).join("");
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>References</Text>

        <Text style={styles.counter}>{candidates.length}</Text>
      </View>

      <Text style={styles.subtitle}>
        Leave or update references for bartenders you matched with.
      </Text>

      {errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}

      {candidates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>⭐</Text>

          <Text style={styles.emptyTitle}>No matched bartenders</Text>

          <Text style={styles.emptyText}>
            You can leave a verified reference after matching with a bartender.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {candidates.map((candidate) => (
            <Pressable
              key={candidate.matchId}
              style={({ pressed }) => [
                styles.candidateCard,
                pressed && styles.cardPressed,
              ]}
              onPress={() => openReference(candidate)}
            >
              {candidate.photoUrl ? (
                <Image
                  source={{
                    uri: candidate.photoUrl,
                  }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderIcon}>👤</Text>
                </View>
              )}

              <View style={styles.candidateContent}>
                <Text style={styles.candidateName}>{candidate.name}</Text>

                <Text style={styles.location}>
                  📍 {candidate.city ?? "City not specified"}
                  {candidate.country ? `, ${candidate.country}` : ""}
                </Text>

                {candidate.referenceId ? (
                  <>
                    <Text style={styles.stars}>
                      {renderStars(candidate.rating ?? 0)}
                    </Text>

                    <Text style={styles.referencePreview} numberOfLines={1}>
                      {candidate.comment}
                    </Text>

                    <Text style={styles.actionText}>Edit reference →</Text>
                  </>
                ) : (
                  <Text style={styles.actionText}>Write a reference →</Text>
                )}
              </View>

              {candidate.referenceId ? (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedBadgeText}>Added</Text>
                </View>
              ) : null}
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
    fontSize: 27,
    fontWeight: "800",
  },
  counter: {
    minWidth: 42,
    color: "#666666",
    fontSize: 16,
    fontWeight: "800",
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
    marginBottom: 16,
    color: "#B00020",
    textAlign: "center",
  },
  list: {
    gap: 12,
  },
  candidateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#E5E0D8",
  },
  placeholder: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: {
    fontSize: 31,
  },
  candidateContent: {
    flex: 1,
    marginLeft: 13,
  },
  candidateName: {
    color: "#2C2C2C",
    fontSize: 18,
    fontWeight: "800",
  },
  location: {
    marginTop: 4,
    color: "#777777",
    fontSize: 13,
  },
  stars: {
    marginTop: 7,
    color: "#D59A00",
    fontSize: 16,
    letterSpacing: 1,
  },
  referencePreview: {
    marginTop: 4,
    color: "#666666",
    fontSize: 12,
  },
  actionText: {
    marginTop: 8,
    color: "#2C2C2C",
    fontSize: 13,
    fontWeight: "800",
  },
  completedBadge: {
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: "#E6F3E8",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  completedBadgeText: {
    color: "#2E7D32",
    fontSize: 10,
    fontWeight: "800",
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
    fontSize: 23,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 10,
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },
});
