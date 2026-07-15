import { supabase } from "@/lib/supabase";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
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

export default function ManagePhotosScreen({ profileId, role }: Props) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<ProfilePhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const tableName =
    role === "bartender" ? "bartender_photos" : "employer_photos";

  const foreignKey = role === "bartender" ? "bartender_id" : "employer_id";

  useEffect(() => {
    loadPhotos();
  }, [profileId, role]);

  async function loadPhotos() {
    setLoading(true);

    const { data, error } = await supabase
      .from(tableName)
      .select("id, url, is_cover")
      .eq(foreignKey, profileId)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("LOAD PHOTOS ERROR:", error);
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const loadedPhotos = data ?? [];

    setPhotos(loadedPhotos);

    const coverPhoto =
      loadedPhotos.find((photo) => photo.is_cover) ?? loadedPhotos[0] ?? null;

    setSelectedPhoto(coverPhoto);
    setLoading(false);
  }

  async function uploadSingleImage(
    image: ImagePicker.ImagePickerAsset,
    shouldBeCover: boolean,
  ) {
    if (!image.base64) {
      throw new Error("Could not read image.");
    }

    const mimeType = image.mimeType || "image/jpeg";
    const fileExtension = mimeType.split("/")[1] || "jpeg";

    const storagePath =
      `${role}/${profileId}-${Date.now()}-` +
      `${Math.random().toString(36).slice(2)}.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(storagePath, decode(image.base64), {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(storagePath);

    const { error: databaseError } = await supabase.from(tableName).insert({
      [foreignKey]: profileId,
      url: publicUrlData.publicUrl,
      is_cover: shouldBeCover,
    });

    if (databaseError) {
      await supabase.storage.from("profile-photos").remove([storagePath]);

      throw databaseError;
    }
  }

  async function pickAndUploadImages() {
    setMessage("");

    const remainingSlots = MAX_PHOTOS - photos.length;

    if (remainingSlots <= 0) {
      setMessage("Maximum of 6 photos reached.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setMessage("Permission to access photos is required.");
      return;
    }

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
      const profileHadNoPhotos = photos.length === 0;

      for (let index = 0; index < result.assets.length; index++) {
        const image = result.assets[index];

        const shouldBeCover = profileHadNoPhotos && index === 0;

        await uploadSingleImage(image, shouldBeCover);
      }

      setMessage("Photos uploaded successfully.");
      await loadPhotos();
    } catch (error) {
      console.log("UPLOAD PHOTOS ERROR:", error);

      setMessage(
        error instanceof Error ? error.message : "Photo upload failed.",
      );

      setLoading(false);
    }
  }

  async function setAsCover(photo: ProfilePhoto) {
    setLoading(true);
    setMessage("");

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

    setMessage("Cover photo updated.");
    await loadPhotos();
  }

  async function deletePhoto(photo: ProfilePhoto) {
    if (photos.length <= MIN_PHOTOS) {
      setMessage("Your profile must keep at least 3 photos.");
      return;
    }

    setLoading(true);
    setMessage("");

    const storageMarker = "/profile-photos/";
    const markerPosition = photo.url.indexOf(storageMarker);

    const storagePath =
      markerPosition >= 0
        ? decodeURIComponent(
            photo.url.slice(markerPosition + storageMarker.length),
          )
        : null;

    const { error: databaseError } = await supabase
      .from(tableName)
      .delete()
      .eq("id", photo.id);

    if (databaseError) {
      setMessage(databaseError.message);
      setLoading(false);
      return;
    }

    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from("profile-photos")
        .remove([storagePath]);

      if (storageError) {
        console.log("STORAGE DELETE ERROR:", storageError);
      }
    }

    const remainingPhotos = photos.filter((item) => item.id !== photo.id);

    if (photo.is_cover && remainingPhotos.length > 0) {
      const { error: newCoverError } = await supabase
        .from(tableName)
        .update({ is_cover: true })
        .eq("id", remainingPhotos[0].id);

      if (newCoverError) {
        console.log("NEW COVER ERROR:", newCoverError);
      }
    }

    setMessage("Photo deleted.");
    await loadPhotos();
  }

  function confirmDelete(photo: ProfilePhoto) {
    Alert.alert("Delete photo", "Are you sure you want to delete this photo?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deletePhoto(photo),
      },
    ]);
  }

  if (loading && photos.length === 0) {
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backButton}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Manage photos</Text>

        <Text style={styles.counter}>
          {photos.length}/{MAX_PHOTOS} photos
        </Text>
      </View>

      <Text style={styles.subtitle}>
        Add between 3 and 6 photos. Choose one as your cover.
      </Text>

      <View style={styles.previewCard}>
        {selectedPhoto ? (
          <Image
            source={{ uri: selectedPhoto.url }}
            style={styles.previewImage}
          />
        ) : (
          <View style={styles.emptyPreview}>
            <Text style={styles.emptyPreviewText}>Add your first photos</Text>
          </View>
        )}

        {selectedPhoto ? (
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.actionButton,
                selectedPhoto.is_cover && styles.disabledAction,
              ]}
              disabled={Boolean(selectedPhoto.is_cover) || loading}
              onPress={() => setAsCover(selectedPhoto)}
            >
              <Text style={styles.actionButtonText}>
                {selectedPhoto.is_cover ? "Current cover" : "Set as cover"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.deleteButton}
              disabled={loading}
              onPress={() => confirmDelete(selectedPhoto)}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.grid}>
        {Array.from({ length: MAX_PHOTOS }).map((_, index) => {
          const photo = photos[index];

          if (!photo) {
            return (
              <Pressable
                key={`empty-${index}`}
                style={styles.emptySlot}
                onPress={pickAndUploadImages}
              >
                <Text style={styles.plus}>+</Text>
                <Text style={styles.slotNumber}>{index + 1}</Text>
              </Pressable>
            );
          }

          const selected = selectedPhoto?.id === photo.id;

          return (
            <Pressable
              key={photo.id}
              style={[styles.photoSlot, selected && styles.selectedSlot]}
              onPress={() => setSelectedPhoto(photo)}
            >
              <Image source={{ uri: photo.url }} style={styles.slotImage} />

              <View style={styles.numberBadge}>
                <Text style={styles.numberBadgeText}>{index + 1}</Text>
              </View>

              {photo.is_cover ? (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>Cover</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {photos.length < MIN_PHOTOS ? (
        <Text style={styles.requirementWarning}>
          Add at least {MIN_PHOTOS - photos.length} more photo
          {MIN_PHOTOS - photos.length === 1 ? "" : "s"}.
        </Text>
      ) : (
        <Text style={styles.requirementComplete}>
          Minimum photo requirement completed.
        </Text>
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={[
          styles.addButton,
          photos.length >= MAX_PHOTOS && styles.disabledAction,
        ]}
        disabled={loading || photos.length >= MAX_PHOTOS}
        onPress={pickAndUploadImages}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.addButtonText}>
            {photos.length >= MAX_PHOTOS
              ? "Maximum photos reached"
              : "Add photos"}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F4EF",
  },
  content: {
    padding: 24,
    paddingTop: 54,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7F4EF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    fontSize: 16,
    color: "#2C2C2C",
    fontWeight: "600",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#2C2C2C",
  },
  counter: {
    fontSize: 15,
    color: "#666",
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 14,
    marginBottom: 20,
    color: "#666",
    textAlign: "center",
    lineHeight: 21,
  },
  previewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    marginBottom: 20,
  },
  previewImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
  },
  emptyPreview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: "#EAE6DF",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPreviewText: {
    color: "#666",
    fontSize: 17,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  deleteButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B00020",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#B00020",
    fontWeight: "800",
  },
  disabledAction: {
    opacity: 0.45,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  photoSlot: {
    width: "31%",
    aspectRatio: 0.8,
    borderRadius: 16,
    padding: 3,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  selectedSlot: {
    borderColor: "#2C2C2C",
  },
  slotImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  emptySlot: {
    width: "31%",
    aspectRatio: 0.8,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#AAA",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  plus: {
    fontSize: 32,
    color: "#777",
  },
  slotNumber: {
    position: "absolute",
    bottom: 8,
    color: "#777",
    fontWeight: "700",
  },
  numberBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },
  numberBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  coverBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "#2C2C2C",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  coverBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  requirementWarning: {
    color: "#B00020",
    textAlign: "center",
    marginTop: 18,
  },
  requirementComplete: {
    color: "#2E7D32",
    textAlign: "center",
    marginTop: 18,
  },
  message: {
    textAlign: "center",
    color: "#2C2C2C",
    marginTop: 12,
  },
  addButton: {
    backgroundColor: "#2C2C2C",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
});
