import { supabase } from "@/lib/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

type MatchRow = {
  id: string;
  bartender_user_id: string;
  employer_user_id: string;
};

type BartenderProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  country: string | null;
};

type EmployerProfileRow = {
  business_name: string | null;
};

type ReferenceRow = {
  id: string;
  rating: number;
  comment: string;
  is_public: boolean;
};

export default function EmployerReferenceFormScreen() {
  const params = useLocalSearchParams<{
    matchId?: string | string[];
  }>();

  const matchId = Array.isArray(params.matchId)
    ? params.matchId[0]
    : params.matchId;

  const [bartenderName, setBartenderName] = useState("Bartender");

  const [bartenderLocation, setBartenderLocation] = useState("");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [bartenderUserId, setBartenderUserId] = useState<string | null>(null);

  const [employerUserId, setEmployerUserId] = useState<string | null>(null);

  const [employerBusinessName, setEmployerBusinessName] = useState("Business");

  const [referenceId, setReferenceId] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadForm();
  }, [matchId]);

  async function loadForm() {
    if (!matchId) {
      setErrorMessage("Match not found.");
      setLoading(false);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.replace("/(auth)/login");
      return;
    }

    const authenticatedUserId = userData.user.id;

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select("id, bartender_user_id, employer_user_id")
      .eq("id", matchId)
      .maybeSingle();

    if (matchError || !matchData) {
      setErrorMessage(matchError?.message ?? "Match not found.");

      setLoading(false);
      return;
    }

    const match = matchData as MatchRow;

    if (match.employer_user_id !== authenticatedUserId) {
      setErrorMessage("You cannot write a reference for this match.");

      setLoading(false);
      return;
    }

    setEmployerUserId(authenticatedUserId);
    setBartenderUserId(match.bartender_user_id);

    const [bartenderResponse, employerResponse, referenceResponse] =
      await Promise.all([
        supabase
          .from("bartender_profiles")
          .select("id, first_name, last_name, city, country")
          .eq("user_id", match.bartender_user_id)
          .single(),

        supabase
          .from("employer_profiles")
          .select("business_name")
          .eq("user_id", authenticatedUserId)
          .single(),

        supabase
          .from("references")
          .select("id, rating, comment, is_public")
          .eq("match_id", matchId)
          .eq("author_user_id", authenticatedUserId)
          .maybeSingle(),
      ]);

    if (bartenderResponse.error || !bartenderResponse.data) {
      setErrorMessage(
        bartenderResponse.error?.message ?? "Bartender profile unavailable.",
      );

      setLoading(false);
      return;
    }

    const bartender = bartenderResponse.data as BartenderProfileRow;

    const fullName =
      [bartender.first_name, bartender.last_name].filter(Boolean).join(" ") ||
      "Bartender";

    setBartenderName(fullName);

    setBartenderLocation(
      [bartender.city, bartender.country].filter(Boolean).join(", "),
    );

    const business = employerResponse.data as EmployerProfileRow | null;

    setEmployerBusinessName(business?.business_name || "Business");

    const { data: photoData } = await supabase
      .from("bartender_photos")
      .select("url")
      .eq("bartender_id", bartender.id)
      .eq("is_cover", true)
      .maybeSingle();

    setPhotoUrl(photoData?.url ?? null);

    const existingReference = referenceResponse.data as ReferenceRow | null;

    if (existingReference) {
      setReferenceId(existingReference.id);
      setRating(existingReference.rating);
      setComment(existingReference.comment);
      setIsPublic(existingReference.is_public);
    }

    setLoading(false);
  }

  async function saveReference() {
    if (!matchId || !bartenderUserId || !employerUserId || saving) {
      return;
    }

    setErrorMessage("");

    if (rating < 1 || rating > 5) {
      setErrorMessage("Please select a rating from 1 to 5.");
      return;
    }

    const trimmedComment = comment.trim();

    if (trimmedComment.length < 10) {
      setErrorMessage("The reference must contain at least 10 characters.");
      return;
    }

    setSaving(true);

    if (referenceId) {
      const { error } = await supabase
        .from("references")
        .update({
          rating,
          comment: trimmedComment,
          is_public: isPublic,
        })
        .eq("id", referenceId)
        .eq("author_user_id", employerUserId);

      if (error) {
        setErrorMessage(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("references").insert({
        bartender_user_id: bartenderUserId,
        match_id: matchId,
        author_user_id: employerUserId,
        request_id: null,
        source_type: "match",
        verification_status: "match_verified",
        author_name: employerBusinessName,
        business_name: employerBusinessName,
        author_job_title: null,
        author_email: null,
        professional_relationship: "Matched through Bartinder",
        rating,
        comment: trimmedComment,
        is_public: isPublic,
      });

      if (error) {
        setErrorMessage(error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.back();
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
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>
          {referenceId ? "Edit reference" : "Write reference"}
        </Text>

        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.profileCard}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>👤</Text>
          </View>
        )}

        <View style={styles.profileContent}>
          <Text style={styles.bartenderName}>{bartenderName}</Text>

          {bartenderLocation ? (
            <Text style={styles.location}>📍 {bartenderLocation}</Text>
          ) : null}

          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedBadgeText}>
              Verified Bartinder match
            </Text>
          </View>
        </View>
      </View>

      {errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}

      <View style={styles.formCard}>
        <Text style={styles.label}>Rating</Text>

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable key={value} onPress={() => setRating(value)} hitSlop={8}>
              <Text
                style={[styles.star, value <= rating && styles.starSelected]}
              >
                {value <= rating ? "★" : "☆"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Reference</Text>

        <TextInput
          style={styles.commentInput}
          placeholder="Describe the bartender's reliability, skills and professionalism..."
          placeholderTextColor="#999999"
          multiline
          maxLength={2000}
          value={comment}
          onChangeText={setComment}
          textAlignVertical="top"
        />

        <Text style={styles.characterCount}>{comment.trim().length}/2000</Text>

        <View style={styles.publicRow}>
          <View style={styles.publicContent}>
            <Text style={styles.publicTitle}>Public reference</Text>

            <Text style={styles.publicDescription}>
              Allow this reference to appear on the bartender’s public profile.
            </Text>
          </View>

          <Switch value={isPublic} onValueChange={setIsPublic} />
        </View>

        <Pressable
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={() => void saveReference()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {referenceId ? "Update reference" : "Publish reference"}
            </Text>
          )}
        </Pressable>
      </View>
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
    marginBottom: 20,
  },
  backText: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    color: "#2C2C2C",
    fontSize: 23,
    fontWeight: "800",
  },
  headerPlaceholder: {
    width: 45,
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#E5E0D8",
  },
  placeholder: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: {
    fontSize: 34,
  },
  profileContent: {
    flex: 1,
    marginLeft: 14,
  },
  bartenderName: {
    color: "#2C2C2C",
    fontSize: 20,
    fontWeight: "800",
  },
  location: {
    marginTop: 5,
    color: "#666666",
    fontSize: 13,
  },
  verifiedBadge: {
    alignSelf: "flex-start",
    marginTop: 9,
    borderRadius: 999,
    backgroundColor: "#E6F3E8",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  verifiedBadgeText: {
    color: "#2E7D32",
    fontSize: 10,
    fontWeight: "800",
  },
  errorMessage: {
    marginTop: 16,
    color: "#B00020",
    textAlign: "center",
  },
  formCard: {
    marginTop: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 20,
  },
  label: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  starsRow: {
    flexDirection: "row",
    marginBottom: 24,
  },
  star: {
    color: "#B9B2A9",
    fontSize: 39,
    marginRight: 7,
  },
  starSelected: {
    color: "#D59A00",
  },
  commentInput: {
    minHeight: 170,
    borderWidth: 1,
    borderColor: "#DDD7CF",
    borderRadius: 14,
    backgroundColor: "#FAF9F7",
    padding: 14,
    color: "#2C2C2C",
    fontSize: 15,
    lineHeight: 22,
  },
  characterCount: {
    marginTop: 7,
    color: "#999999",
    fontSize: 11,
    textAlign: "right",
  },
  publicRow: {
    marginTop: 23,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#EEE9E2",
    flexDirection: "row",
    alignItems: "center",
  },
  publicContent: {
    flex: 1,
    marginRight: 14,
  },
  publicTitle: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
  },
  publicDescription: {
    marginTop: 4,
    color: "#777777",
    fontSize: 12,
    lineHeight: 18,
  },
  saveButton: {
    minHeight: 54,
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
