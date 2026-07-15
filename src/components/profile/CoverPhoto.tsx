import { supabase } from "@/lib/supabase";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

type Props = {
  profileId: string;
  role: "bartender" | "employer";
};

export default function CoverPhoto({ profileId, role }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCoverPhoto = useCallback(async () => {
    setLoading(true);

    const tableName =
      role === "bartender" ? "bartender_photos" : "employer_photos";

    const foreignKey = role === "bartender" ? "bartender_id" : "employer_id";

    const { data, error } = await supabase
      .from(tableName)
      .select("url")
      .eq(foreignKey, profileId)
      .eq("is_cover", true)
      .maybeSingle();

    if (error) {
      console.log("LOAD COVER PHOTO ERROR:", error);
      setPhotoUrl(null);
      setLoading(false);
      return;
    }

    setPhotoUrl(data?.url ?? null);
    setLoading(false);
  }, [profileId, role]);

  useFocusEffect(
    useCallback(() => {
      loadCoverPhoto();
    }, [loadCoverPhoto]),
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingPlaceholder}>
          <ActivityIndicator color="#2C2C2C" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <>
          <View style={styles.placeholder}>
            <Text style={styles.icon}>👤</Text>
          </View>

          <Text style={styles.text}>
            Complete your profile with a great first photo
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: 18,
  },
  image: {
    width: 145,
    height: 145,
    borderRadius: 72.5,
  },
  loadingPlaceholder: {
    width: 145,
    height: 145,
    borderRadius: 72.5,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 145,
    height: 145,
    borderRadius: 72.5,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 58,
  },
  text: {
    marginTop: 12,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
