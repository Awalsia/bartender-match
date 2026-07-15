import { supabase } from "@/lib/supabase";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  profileId: string;
  role: "bartender" | "employer";
};

type ProfilePhoto = {
  id: string;
  url: string;
  is_cover: boolean | null;
};

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 6;

export default function ProfilePhotoUploader({ profileId, role }: Props) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<ProfilePhoto | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const tableName =
    role === "bartender" ? "bartender_photos" : "employer_photos";

  const foreignKey = role === "bartender" ? "bartender_id" : "employer_id";

  useEffect(() => {
    loadPhotos();
  }, []);

  async function loadPhotos() {
    const { data, error } = await supabase
      .from(tableName)
      .select("id, url, is_cover")
      .eq(foreignKey, profileId)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("LOAD PHOTOS ERROR:", error);
      return;
    }

    const loadedPhotos = data || [];
    setPhotos(loadedPhotos);

    const coverPhoto =
      loadedPhotos.find((photo) => photo.is_cover) || loadedPhotos[0] || null;

    setSelectedPhoto(coverPhoto);
  }

  async function uploadSingleImage(image: ImagePicker.ImagePickerAsset) {
    if (!image.base64) {
      throw new Error("Could not read image.");
    }

    const mimeType = image.mimeType || "image/jpeg";
    const fileExt = mimeType.split("/")[1] || "jpeg";
    const fileName = `${role}/${profileId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, decode(image.base64), {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(fileName);

    const isFirstPhoto = photos.length === 0;

    const { error: dbError } = await supabase.from(tableName).insert({
      [foreignKey]: profileId,
      url: data.publicUrl,
      is_cover: isFirstPhoto,
    });

    if (dbError) throw dbError;
  }

  async function pickAndUploadImages() {
    setMessage("");

    if (photos.length >= MAX_PHOTOS) {
      setMessage("Maximum photos reached.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setMessage("Permission to access photos is required.");
      return;
    }

    const remainingSlots = MAX_PHOTOS - photos.length;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled) return;

    setLoading(true);

    try {
      for (const image of result.assets) {
        await uploadSingleImage(image);
      }

      await loadPhotos();
      setMessage("Photos uploaded successfully.");
    } catch (error) {
      console.log("PHOTO UPLOAD ERROR:", error);
      setMessage("Photo upload failed.");
    }

    setLoading(false);
  }

  async function setAsCover(photo: ProfilePhoto) {
    setMessage("");
    setLoading(true);

    const { error: resetError } = await supabase
      .from(tableName)
      .update({ is_cover: false })
      .eq(foreignKey, profileId);

    if (resetError) {
      setMessage(resetError.message);
      setLoading(false);
      return;
    }

    const { error: coverError } = await supabase
      .from(tableName)
      .update({ is_cover: true })
      .eq("id", photo.id);

    if (coverError) {
      setMessage(coverError.message);
      setLoading(false);
      return;
    }

    await loadPhotos();
    setMessage("Cover photo updated.");
    setLoading(false);
  }

  async function deletePhoto(photo: ProfilePhoto) {
    setMessage("");
    setLoading(true);

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("id", photo.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    await loadPhotos();
    setMessage("Photo deleted.");
    setLoading(false);
  }

  function openPhotoActions(photo: ProfilePhoto) {
    Alert.alert("Photo options", "Choose an action", [
      {
        text: "Set as cover",
        onPress: () => setAsCover(photo),
      },
      {
        text: "Delete photo",
        style: "destructive",
        onPress: () => deletePhoto(photo),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  }

  const missingPhotos =
    photos.length < MIN_PHOTOS ? MIN_PHOTOS - photos.length : 0;

  const progressPercent = Math.min((photos.length / MAX_PHOTOS) * 100, 100);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Profile photos</Text>

      <View style={styles.mainImageWrapper}>
        {selectedPhoto ? (
          <Image source={{ uri: selectedPhoto.url }} style={styles.mainImage} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No photo yet</Text>
          </View>
        )}
      </View>

      <View style={styles.progressHeader}>
        <Text style={styles.counter}>{photos.length}/6 photos</Text>

        {missingPhotos > 0 ? (
          <Text style={styles.warning}>Minimum 3 required</Text>
        ) : (
          <Text style={styles.success}>Profile ready</Text>
        )}
      </View>

      <View style={styles.progressBackground}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>

      {missingPhotos > 0 ? (
        <Text style={styles.helperText}>
          Add at least {missingPhotos} more photo
          {missingPhotos > 1 ? "s" : ""}.
        </Text>
      ) : (
        <Text style={styles.helperText}>
          Great! You have enough photos for your profile.
        </Text>
      )}

      {photos.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.thumbnailRow}
        >
          {photos.map((photo, index) => {
            const isSelected = selectedPhoto?.id === photo.id;

            return (
              <Pressable
                key={photo.id}
                style={[
                  styles.thumbnailWrapper,
                  isSelected && styles.thumbnailSelected,
                ]}
                onPress={() => setSelectedPhoto(photo)}
                onLongPress={() => openPhotoActions(photo)}
              >
                <Image source={{ uri: photo.url }} style={styles.thumbnail} />

                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{index + 1}</Text>
                </View>

                {photo.is_cover ? (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverBadgeText}>Cover</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={[
          styles.button,
          photos.length >= MAX_PHOTOS && styles.buttonDisabled,
        ]}
        onPress={pickAndUploadImages}
        disabled={loading || photos.length >= MAX_PHOTOS}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            {photos.length >= MAX_PHOTOS
              ? "Maximum photos reached"
              : photos.length === 0
                ? "Add profile photos"
                : "Add more photos"}
          </Text>
        )}
      </Pressable>

      {photos.length > 0 ? (
        <Text style={styles.tip}>Hold a photo to set cover or delete.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    alignItems: "center",
  },
  cardTitle: {
    alignSelf: "flex-start",
    fontSize: 20,
    fontWeight: "800",
    color: "#2C2C2C",
    marginBottom: 16,
  },
  mainImageWrapper: {
    marginBottom: 14,
  },
  mainImage: {
    width: 145,
    height: 145,
    borderRadius: 72.5,
  },
  placeholder: {
    width: 145,
    height: 145,
    borderRadius: 72.5,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#666",
  },
  progressHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  counter: {
    color: "#444",
    fontWeight: "700",
  },
  warning: {
    color: "#B00020",
    fontWeight: "700",
  },
  success: {
    color: "#2E7D32",
    fontWeight: "700",
  },
  progressBackground: {
    width: "100%",
    height: 8,
    borderRadius: 8,
    backgroundColor: "#E5E0D8",
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2C2C2C",
    borderRadius: 8,
  },
  helperText: {
    color: "#666",
    textAlign: "center",
    marginBottom: 14,
  },
  thumbnailRow: {
    maxHeight: 84,
    marginBottom: 14,
  },
  thumbnailWrapper: {
    position: "relative",
    marginHorizontal: 5,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
    padding: 2,
  },
  thumbnailSelected: {
    borderColor: "#2C2C2C",
  },
  thumbnail: {
    width: 58,
    height: 58,
    borderRadius: 12,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#2C2C2C",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  coverBadge: {
    position: "absolute",
    bottom: -10,
    alignSelf: "center",
    backgroundColor: "#2C2C2C",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  coverBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  message: {
    marginBottom: 10,
    color: "#2C2C2C",
    textAlign: "center",
  },
  button: {
    backgroundColor: "#2C2C2C",
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  tip: {
    marginTop: 10,
    color: "#777",
    fontSize: 12,
  },
});
