import ManagePhotosScreen from "@/components/profile/ManagePhotosScreen";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function EmployerManageMediaPage() {
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    void loadProfileId();
  }, []);

  async function loadProfileId() {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.replace("/(auth)/login");
      return;
    }

    const { data, error } = await supabase
      .from("employer_profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error || !data) {
      router.replace("/(employer)/complete-profile");
      return;
    }

    setProfileId(data.id);
  }

  if (!profileId) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2C2C2C" />
      </View>
    );
  }

  return <ManagePhotosScreen profileId={profileId} role="employer" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F4EF",
  },
});
