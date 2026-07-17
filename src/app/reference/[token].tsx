import { supabase } from "@/lib/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";

type RequestStatus = "active" | "invalid" | "used" | "revoked" | "expired";

type PublicRequestData = {
  is_valid: boolean;
  request_status: RequestStatus;
  bartender_name: string | null;
  request_expires_at: string | null;
};

type SubmissionMode = "choice" | "guest" | "authenticated";

export default function PublicReferenceScreen() {
  const params = useLocalSearchParams<{
    token?: string | string[];
  }>();

  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  const [requestData, setRequestData] = useState<PublicRequestData | null>(
    null,
  );

  const [submissionMode, setSubmissionMode] =
    useState<SubmissionMode>("choice");

  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(
    null,
  );

  const [authorName, setAuthorName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void initializePage();
  }, [token]);

  async function initializePage() {
    if (!token) {
      setRequestData({
        is_valid: false,
        request_status: "invalid",
        bartender_name: null,
        request_expires_at: null,
      });

      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const [requestResponse, userResponse] = await Promise.all([
      supabase.rpc("get_reference_request_public", {
        p_raw_token: token,
      }),
      supabase.auth.getUser(),
    ]);

    if (requestResponse.error) {
      console.log(
        "LOAD PUBLIC REFERENCE REQUEST ERROR:",
        requestResponse.error,
      );

      setErrorMessage(requestResponse.error.message);

      setLoading(false);
      return;
    }

    const rawResult = Array.isArray(requestResponse.data)
      ? requestResponse.data[0]
      : requestResponse.data;

    const publicRequest = rawResult as PublicRequestData | undefined;

    if (!publicRequest) {
      setRequestData({
        is_valid: false,
        request_status: "invalid",
        bartender_name: null,
        request_expires_at: null,
      });
    } else {
      setRequestData(publicRequest);
    }

    const user = userResponse.data.user ?? null;

    setAuthenticatedUserId(user?.id ?? null);

    if (user) {
      setEmail(user.email ?? "");

      await loadAuthenticatedEmployerData(user.id);
    }

    setLoading(false);
  }

  async function loadAuthenticatedEmployerData(userId: string) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("role, email")
      .eq("id", userId)
      .maybeSingle();

    if (profileData?.email) {
      setEmail(profileData.email);
    }

    if (profileData?.role !== "employer") {
      return;
    }

    const { data: employerData } = await supabase
      .from("employer_profiles")
      .select("business_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (employerData?.business_name) {
      setBusinessName(employerData.business_name);
    }
  }

  function continueAsGuest() {
    setErrorMessage("");
    setSubmissionMode("guest");
  }

  function continueWithAccount() {
    setErrorMessage("");

    if (!authenticatedUserId) {
      router.push({
        pathname: "/(auth)/login",
        params: {
          returnTo: `/reference/${token}`,
        },
      });

      return;
    }

    setSubmissionMode("authenticated");
  }

  function returnToChoice() {
    setErrorMessage("");
    setSubmissionMode("choice");
  }

  function validateForm(): string | null {
    if (authorName.trim().length < 2) {
      return "Please enter your name.";
    }

    if (!email.trim()) {
      return "Please enter your email address.";
    }

    if (relationship.trim().length < 2) {
      return "Please describe your professional relationship.";
    }

    if (rating < 1 || rating > 5) {
      return "Please select a rating from 1 to 5.";
    }

    if (comment.trim().length < 10) {
      return "The reference must contain at least 10 characters.";
    }

    return null;
  }

  async function submitReference() {
    if (!token || submitting) {
      return;
    }

    setErrorMessage("");

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (submissionMode === "authenticated" && !authenticatedUserId) {
      setErrorMessage("Please log in before submitting.");

      return;
    }

    setSubmitting(true);

    const { error } = await supabase.rpc("submit_external_reference", {
      p_raw_token: token,
      p_continue_as_guest: submissionMode === "guest",
      p_author_name: authorName.trim(),
      p_business_name: businessName.trim() || null,
      p_author_job_title: jobTitle.trim() || null,
      p_author_email: email.trim(),
      p_professional_relationship: relationship.trim(),
      p_rating: rating,
      p_comment: comment.trim(),
      p_is_public: isPublic,
    });

    if (error) {
      console.log("SUBMIT EXTERNAL REFERENCE ERROR:", error);

      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  function formatExpiration(dateValue: string | null) {
    if (!dateValue) {
      return "";
    }

    return new Date(dateValue).toLocaleString();
  }

  function getUnavailableContent(status: RequestStatus) {
    if (status === "used") {
      return {
        icon: "✓",
        title: "Reference already submitted",
        message: "This one-time reference link has already been used.",
      };
    }

    if (status === "expired") {
      return {
        icon: "⌛",
        title: "Link expired",
        message:
          "This reference link has expired. Ask the bartender to generate a new one.",
      };
    }

    if (status === "revoked") {
      return {
        icon: "⛔",
        title: "Link revoked",
        message: "This reference link has been revoked by the bartender.",
      };
    }

    return {
      icon: "⚠️",
      title: "Invalid link",
      message: "This reference link is invalid or no longer exists.",
    };
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Checking reference link...</Text>
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.resultCard}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>

          <Text style={styles.resultTitle}>Reference submitted</Text>

          <Text style={styles.resultMessage}>
            Thank you. Your reference has been sent to{" "}
            {requestData?.bartender_name ?? "the bartender"}.
          </Text>

          <Text style={styles.resultHint}>
            This one-time link can no longer be used.
          </Text>
        </View>
      </View>
    );
  }

  if (!requestData || !requestData.is_valid) {
    const content = getUnavailableContent(
      requestData?.request_status ?? "invalid",
    );

    return (
      <View style={styles.centerContainer}>
        <View style={styles.resultCard}>
          <Text style={styles.unavailableIcon}>{content.icon}</Text>

          <Text style={styles.resultTitle}>{content.title}</Text>

          <Text style={styles.resultMessage}>{content.message}</Text>
        </View>
      </View>
    );
  }

  if (submissionMode === "choice") {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.choiceContent}
      >
        <View style={styles.choiceCard}>
          <Text style={styles.choiceIcon}>⭐</Text>

          <Text style={styles.choiceTitle}>Leave a reference</Text>

          <Text style={styles.choiceText}>
            {requestData.bartender_name} has asked you to provide a professional
            reference.
          </Text>

          <Text style={styles.expirationText}>
            Link expires {formatExpiration(requestData.request_expires_at)}
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.accountButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={continueWithAccount}
          >
            <Text style={styles.accountButtonText}>
              {authenticatedUserId ? "Continue with my account" : "Log in"}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.guestButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={continueAsGuest}
          >
            <Text style={styles.guestButtonText}>Continue as guest</Text>
          </Pressable>

          <Text style={styles.choiceHint}>
            A logged-in employer receives a “Verified account” badge. Guest
            references remain marked as external.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formHeader}>
          <Pressable onPress={returnToChoice} hitSlop={10}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.formHeaderTitle}>
            Reference for {requestData.bartender_name}
          </Text>

          <View style={styles.headerPlaceholder} />
        </View>

        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>
            {submissionMode === "authenticated"
              ? "Verified account"
              : "External guest"}
          </Text>
        </View>

        {errorMessage ? (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        ) : null}

        <View style={styles.formCard}>
          <Text style={styles.label}>Your name *</Text>

          <TextInput
            style={styles.input}
            placeholder="Full name"
            value={authorName}
            onChangeText={setAuthorName}
            maxLength={120}
          />

          <Text style={styles.label}>Business name</Text>

          <TextInput
            style={styles.input}
            placeholder="Company, bar or restaurant"
            value={businessName}
            onChangeText={setBusinessName}
            maxLength={160}
          />

          <Text style={styles.label}>Your job title</Text>

          <TextInput
            style={styles.input}
            placeholder="Manager, owner, supervisor..."
            value={jobTitle}
            onChangeText={setJobTitle}
            maxLength={120}
          />

          <Text style={styles.label}>Email *</Text>

          <TextInput
            style={styles.input}
            placeholder="name@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={254}
          />

          <Text style={styles.label}>Professional relationship *</Text>

          <TextInput
            style={styles.input}
            placeholder="Former manager, employer, colleague..."
            value={relationship}
            onChangeText={setRelationship}
            maxLength={200}
          />

          <Text style={styles.label}>Rating *</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                onPress={() => setRating(value)}
                hitSlop={8}
              >
                <Text
                  style={[styles.star, value <= rating && styles.selectedStar]}
                >
                  {value <= rating ? "★" : "☆"}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Reference *</Text>

          <TextInput
            style={styles.commentInput}
            placeholder="Describe the bartender's reliability, skills and professionalism..."
            value={comment}
            onChangeText={setComment}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />

          <Text style={styles.characterCount}>
            {comment.trim().length}/2000
          </Text>

          <View style={styles.publicRow}>
            <View style={styles.publicContent}>
              <Text style={styles.publicTitle}>Public reference</Text>

              <Text style={styles.publicDescription}>
                Allow this reference to appear on the bartender’s public
                profile.
              </Text>
            </View>

            <Switch value={isPublic} onValueChange={setIsPublic} />
          </View>

          <Pressable
            style={[
              styles.submitButton,
              submitting && styles.submitButtonDisabled,
            ]}
            onPress={() => void submitReference()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit reference</Text>
            )}
          </Pressable>

          <Text style={styles.privacyText}>
            The link becomes unusable immediately after a successful submission.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F4EF",
  },

  centerContainer: {
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

  choiceContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },

  choiceCard: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 28,
    alignItems: "center",
  },

  choiceIcon: {
    fontSize: 56,
  },

  choiceTitle: {
    marginTop: 14,
    fontSize: 30,
    fontWeight: "800",
    color: "#2C2C2C",
    textAlign: "center",
  },

  choiceText: {
    marginTop: 12,
    color: "#666666",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },

  expirationText: {
    marginTop: 12,
    color: "#888888",
    fontSize: 12,
    textAlign: "center",
  },

  accountButton: {
    width: "100%",
    minHeight: 54,
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },

  accountButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  guestButton: {
    width: "100%",
    minHeight: 54,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2C2C2C",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  guestButtonText: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
  },

  choiceHint: {
    marginTop: 18,
    color: "#888888",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },

  resultCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 30,
    alignItems: "center",
  },

  successIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#E6F3E8",
    alignItems: "center",
    justifyContent: "center",
  },

  successIconText: {
    color: "#2E7D32",
    fontSize: 48,
    fontWeight: "800",
  },

  unavailableIcon: {
    fontSize: 58,
  },

  resultTitle: {
    marginTop: 18,
    color: "#2C2C2C",
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
  },

  resultMessage: {
    marginTop: 12,
    color: "#666666",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },

  resultHint: {
    marginTop: 14,
    color: "#888888",
    fontSize: 12,
    textAlign: "center",
  },

  formContent: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 20,
    paddingTop: 44,
    paddingBottom: 44,
  },

  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  backText: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "700",
  },

  formHeaderTitle: {
    flex: 1,
    marginHorizontal: 12,
    color: "#2C2C2C",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
  },

  headerPlaceholder: {
    width: 45,
  },

  modeBadge: {
    alignSelf: "center",
    marginBottom: 14,
    borderRadius: 999,
    backgroundColor: "#E6F3E8",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  modeBadgeText: {
    color: "#2E7D32",
    fontSize: 11,
    fontWeight: "800",
  },

  errorMessage: {
    marginBottom: 14,
    color: "#B00020",
    textAlign: "center",
  },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 22,
  },

  label: {
    marginTop: 16,
    marginBottom: 8,
    color: "#2C2C2C",
    fontSize: 15,
    fontWeight: "800",
  },

  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#DDD7CF",
    borderRadius: 13,
    backgroundColor: "#FAF9F7",
    paddingHorizontal: 14,
    color: "#2C2C2C",
    fontSize: 15,
  },

  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  star: {
    color: "#B9B2A9",
    fontSize: 40,
    marginRight: 8,
  },

  selectedStar: {
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
    marginTop: 22,
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

  submitButton: {
    minHeight: 55,
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },

  submitButtonDisabled: {
    opacity: 0.6,
  },

  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  privacyText: {
    marginTop: 14,
    color: "#888888",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
});
