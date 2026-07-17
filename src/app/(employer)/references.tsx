import { supabase } from "@/lib/supabase";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

type ReferenceSource = "match" | "external_authenticated" | "external_guest";

type VerificationStatus = "match_verified" | "account_verified" | "unverified";

type ReferenceRow = {
  id: string;
  source_type: ReferenceSource;
  verification_status: VerificationStatus;
  author_name: string;
  business_name: string | null;
  author_job_title: string | null;
  professional_relationship: string | null;
  rating: number;
  comment: string;
  is_public: boolean;
  created_at: string;
};

export default function BartenderReferencesScreen() {
  const [references, setReferences] = useState<ReferenceRow[]>([]);

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
      console.log("LOAD REFERENCES USER ERROR:", userError);

      router.replace("/(auth)/login");
      return;
    }

    const { data, error } = await supabase
      .from("references")
      .select(
        `
        id,
        source_type,
        verification_status,
        author_name,
        business_name,
        author_job_title,
        professional_relationship,
        rating,
        comment,
        is_public,
        created_at
        `,
      )
      .eq("bartender_user_id", userData.user.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.log("LOAD BARTENDER REFERENCES ERROR:", error);

      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setReferences((data ?? []) as ReferenceRow[]);
    setLoading(false);
  }

  function formatDate(dateValue: string) {
    return new Date(dateValue).toLocaleDateString();
  }

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, index) =>
      index < rating ? "★" : "☆",
    ).join("");
  }

  function getVerificationLabel(status: VerificationStatus) {
    if (status === "match_verified") {
      return "Verified match";
    }

    if (status === "account_verified") {
      return "Verified account";
    }

    return "External guest";
  }

  function getSourceDescription(source: ReferenceSource) {
    if (source === "match") {
      return "Submitted through a Bartinder match";
    }

    if (source === "external_authenticated") {
      return "Submitted through your reference link";
    }

    return "Submitted by an external guest";
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading references...</Text>
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

        <Text style={styles.counter}>{references.length}</Text>
      </View>

      <Text style={styles.subtitle}>
        References received from businesses and previous employers.
      </Text>

      <Pressable
        style={({ pressed }) => [
          styles.requestButton,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => router.push("/(bartender)/request-reference")}
      >
        <Text style={styles.requestIcon}>＋</Text>

        <View style={styles.requestContent}>
          <Text style={styles.requestTitle}>Request a reference</Text>

          <Text style={styles.requestDescription}>
            Generate a private one-time link for a previous employer.
          </Text>
        </View>

        <Text style={styles.requestArrow}>›</Text>
      </Pressable>

      {errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}

      {references.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>⭐</Text>

          <Text style={styles.emptyTitle}>No references yet</Text>

          <Text style={styles.emptyText}>
            Ask a previous employer for a reference, or receive one from a
            matched business.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {references.map((reference) => (
            <View key={reference.id} style={styles.referenceCard}>
              <View style={styles.referenceHeader}>
                <View style={styles.authorContent}>
                  <Text style={styles.authorName}>{reference.author_name}</Text>

                  {reference.business_name ? (
                    <Text style={styles.businessName}>
                      {reference.business_name}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>
                    {getVerificationLabel(reference.verification_status)}
                  </Text>
                </View>
              </View>

              {reference.author_job_title ? (
                <Text style={styles.authorJobTitle}>
                  {reference.author_job_title}
                </Text>
              ) : null}

              <Text style={styles.stars}>{renderStars(reference.rating)}</Text>

              <Text style={styles.comment}>“{reference.comment}”</Text>

              {reference.professional_relationship ? (
                <Text style={styles.relationship}>
                  Relationship: {reference.professional_relationship}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <Text style={styles.source}>
                  {getSourceDescription(reference.source_type)}
                </Text>

                <Text style={styles.date}>
                  {formatDate(reference.created_at)}
                </Text>
              </View>

              {!reference.is_public ? (
                <View style={styles.privateBadge}>
                  <Text style={styles.privateBadgeText}>Private reference</Text>
                </View>
              ) : null}
            </View>
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
    marginBottom: 20,
    color: "#666666",
    textAlign: "center",
    lineHeight: 21,
  },
  requestButton: {
    backgroundColor: "#2C2C2C",
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  requestIcon: {
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "400",
    marginRight: 14,
  },
  requestContent: {
    flex: 1,
  },
  requestTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  requestDescription: {
    marginTop: 4,
    color: "#D8D8D8",
    fontSize: 13,
    lineHeight: 18,
  },
  requestArrow: {
    color: "#FFFFFF",
    fontSize: 30,
    marginLeft: 8,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  errorMessage: {
    marginBottom: 16,
    color: "#B00020",
    textAlign: "center",
  },
  list: {
    gap: 14,
  },
  referenceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 20,
  },
  referenceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  authorContent: {
    flex: 1,
  },
  authorName: {
    color: "#2C2C2C",
    fontSize: 20,
    fontWeight: "800",
  },
  businessName: {
    marginTop: 3,
    color: "#666666",
    fontSize: 14,
  },
  verifiedBadge: {
    marginLeft: 10,
    backgroundColor: "#E6F3E8",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  verifiedBadgeText: {
    color: "#2E7D32",
    fontSize: 10,
    fontWeight: "800",
  },
  authorJobTitle: {
    marginTop: 7,
    color: "#777777",
    fontSize: 13,
  },
  stars: {
    marginTop: 15,
    color: "#D59A00",
    fontSize: 24,
    letterSpacing: 2,
  },
  comment: {
    marginTop: 13,
    color: "#444444",
    fontSize: 16,
    lineHeight: 24,
    fontStyle: "italic",
  },
  relationship: {
    marginTop: 14,
    color: "#666666",
    fontSize: 13,
  },
  footer: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#EEE9E2",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  source: {
    flex: 1,
    color: "#888888",
    fontSize: 11,
  },
  date: {
    color: "#888888",
    fontSize: 11,
  },
  privateBadge: {
    alignSelf: "flex-start",
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: "#EEE9E2",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  privateBadgeText: {
    color: "#666666",
    fontSize: 11,
    fontWeight: "700",
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
});
