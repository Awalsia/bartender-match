import { supabase } from "@/lib/supabase";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View,
} from "react-native";

type ReferenceRequestRow = {
  id: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type CreatedRequest = {
  request_id: string;
  raw_token: string;
  request_expires_at: string;
};

const WEB_BASE_URL = "http://localhost:8081";

export default function RequestReferenceScreen() {
  const [requests, setRequests] = useState<ReferenceRequestRow[]>([]);

  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const [generatedExpiration, setGeneratedExpiration] = useState<string | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void loadRequests();
    }, []),
  );

  async function loadRequests() {
    setLoading(true);
    setErrorMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.replace("/(auth)/login");
      return;
    }

    const { data, error } = await supabase
      .from("reference_requests")
      .select(
        `
        id,
        expires_at,
        used_at,
        revoked_at,
        created_at
        `,
      )
      .eq("bartender_user_id", userData.user.id)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.log("LOAD REFERENCE REQUESTS ERROR:", error);

      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setRequests((data ?? []) as ReferenceRequestRow[]);

    setLoading(false);
  }

  async function createReferenceLink() {
    if (creating) return;

    setCreating(true);
    setErrorMessage("");
    setGeneratedLink(null);
    setGeneratedExpiration(null);

    const { data, error } = await supabase.rpc("create_reference_request");

    if (error) {
      console.log("CREATE REFERENCE REQUEST ERROR:", error);

      setErrorMessage(error.message);
      setCreating(false);
      return;
    }

    const result = Array.isArray(data)
      ? (data[0] as CreatedRequest | undefined)
      : (data as CreatedRequest | null);

    if (!result?.raw_token) {
      setErrorMessage("The reference link could not be generated.");

      setCreating(false);
      return;
    }

    const link =
      `${WEB_BASE_URL}/reference/` + encodeURIComponent(result.raw_token);

    setGeneratedLink(link);
    setGeneratedExpiration(result.request_expires_at);

    setCreating(false);
    await loadRequests();
  }

  async function shareGeneratedLink() {
    if (!generatedLink) return;

    await Share.share({
      title: "Bartinder reference request",
      message:
        "Could you leave me a professional reference on Bartinder?\n\n" +
        generatedLink +
        "\n\nThis private link can only be used once.",
    });
  }

  async function revokeRequest(requestId: string) {
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) return;

    const { error } = await supabase
      .from("reference_requests")
      .update({
        revoked_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("bartender_user_id", userData.user.id)
      .is("used_at", null);

    if (error) {
      console.log("REVOKE REFERENCE REQUEST ERROR:", error);

      setErrorMessage(error.message);
      return;
    }

    await loadRequests();
  }

  function formatDate(dateValue: string) {
    return new Date(dateValue).toLocaleString();
  }

  function getRequestStatus(request: ReferenceRequestRow) {
    if (request.used_at) {
      return "Used";
    }

    if (request.revoked_at) {
      return "Revoked";
    }

    if (new Date(request.expires_at).getTime() < Date.now()) {
      return "Expired";
    }

    return "Active";
  }

  function isRequestActive(request: ReferenceRequestRow) {
    return (
      !request.used_at &&
      !request.revoked_at &&
      new Date(request.expires_at).getTime() > Date.now()
    );
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

        <Text style={styles.title}>Request reference</Text>

        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.introCard}>
        <Text style={styles.introIcon}>🔗</Text>

        <Text style={styles.introTitle}>Create a one-time link</Text>

        <Text style={styles.introText}>
          Send the link to a previous employer. The link expires after 14 days
          and can only be used once.
        </Text>

        <Pressable
          style={[styles.createButton, creating && styles.buttonDisabled]}
          onPress={() => void createReferenceLink()}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createButtonText}>Generate reference link</Text>
          )}
        </Pressable>
      </View>

      {errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}

      {generatedLink ? (
        <View style={styles.generatedCard}>
          <Text style={styles.generatedTitle}>Your link is ready</Text>

          <Text style={styles.generatedLink} selectable>
            {generatedLink}
          </Text>

          {generatedExpiration ? (
            <Text style={styles.expirationText}>
              Expires: {formatDate(generatedExpiration)}
            </Text>
          ) : null}

          <Pressable
            style={styles.shareButton}
            onPress={() => void shareGeneratedLink()}
          >
            <Text style={styles.shareButtonText}>Share link</Text>
          </Pressable>

          <Text style={styles.securityText}>
            The complete link is shown only now. Bartinder stores only a
            protected hash of the token.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Previous requests</Text>

      {requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            You have not created any reference links yet.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {requests.map((request) => {
            const status = getRequestStatus(request);

            return (
              <View key={request.id} style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <Text style={styles.requestDate}>
                    Created {formatDate(request.created_at)}
                  </Text>

                  <View
                    style={[
                      styles.statusBadge,
                      status === "Active" && styles.activeBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        status === "Active" && styles.activeStatusText,
                      ]}
                    >
                      {status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.requestExpiry}>
                  Expires {formatDate(request.expires_at)}
                </Text>

                {isRequestActive(request) ? (
                  <Pressable
                    style={styles.revokeButton}
                    onPress={() => void revokeRequest(request.id)}
                  >
                    <Text style={styles.revokeButtonText}>Revoke link</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
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
  introCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 24,
    alignItems: "center",
  },
  introIcon: {
    fontSize: 48,
  },
  introTitle: {
    marginTop: 12,
    color: "#2C2C2C",
    fontSize: 23,
    fontWeight: "800",
  },
  introText: {
    marginTop: 10,
    color: "#666666",
    lineHeight: 22,
    textAlign: "center",
  },
  createButton: {
    width: "100%",
    minHeight: 54,
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },
  createButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorMessage: {
    marginTop: 16,
    color: "#B00020",
    textAlign: "center",
  },
  generatedCard: {
    marginTop: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D8D1C8",
    padding: 20,
  },
  generatedTitle: {
    color: "#2C2C2C",
    fontSize: 19,
    fontWeight: "800",
  },
  generatedLink: {
    marginTop: 12,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#F3F1ED",
    color: "#2C2C2C",
    fontSize: 13,
    lineHeight: 19,
  },
  expirationText: {
    marginTop: 10,
    color: "#777777",
    fontSize: 12,
  },
  shareButton: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    paddingVertical: 14,
    alignItems: "center",
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  securityText: {
    marginTop: 13,
    color: "#888888",
    fontSize: 11,
    lineHeight: 17,
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    color: "#2C2C2C",
    fontSize: 20,
    fontWeight: "800",
  },
  list: {
    gap: 12,
  },
  requestCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 17,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  requestDate: {
    flex: 1,
    color: "#2C2C2C",
    fontSize: 14,
    fontWeight: "700",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "#EEE9E2",
  },
  activeBadge: {
    backgroundColor: "#E6F3E8",
  },
  statusText: {
    color: "#666666",
    fontSize: 10,
    fontWeight: "800",
  },
  activeStatusText: {
    color: "#2E7D32",
  },
  requestExpiry: {
    marginTop: 8,
    color: "#888888",
    fontSize: 12,
  },
  revokeButton: {
    alignSelf: "flex-start",
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#B00020",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  revokeButtonText: {
    color: "#B00020",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 22,
  },
  emptyText: {
    color: "#666666",
    textAlign: "center",
    lineHeight: 21,
  },
});
