import { supabase } from "@/lib/supabase";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
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

type ProfileVideo = {
  id: string;
  url: string;
  storage_path: string;
  thumbnail_url: string | null;
  thumbnail_storage_path: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  position: number;
  created_at: string;
};

type MessageType = "success" | "error" | null;

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 6;

const MAX_VIDEOS = 2;
const MAX_VIDEO_DURATION_SECONDS = 30;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

const PHOTO_BUCKET = "profile-photos";
const VIDEO_BUCKET = "profile-videos";

export default function ManagePhotosScreen({ profileId, role }: Props) {
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(
    null,
  );

  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [videos, setVideos] = useState<ProfileVideo[]>([]);

  const [selectedPhoto, setSelectedPhoto] = useState<ProfilePhoto | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);

  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<MessageType>(null);

  const photoTable =
    role === "bartender" ? "bartender_photos" : "employer_photos";

  const photoForeignKey = role === "bartender" ? "bartender_id" : "employer_id";

  const videoTable =
    role === "bartender" ? "bartender_videos" : "employer_videos";

  const videoForeignKey = role === "bartender" ? "bartender_id" : "employer_id";

  useEffect(() => {
    void initializeScreen();
  }, [profileId, role]);

  async function initializeScreen() {
    setInitialLoading(true);
    clearMessage();

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.replace("/(auth)/login");
      return;
    }

    setAuthenticatedUserId(userData.user.id);

    await Promise.all([loadPhotos(false), loadVideos(false)]);

    setInitialLoading(false);
  }

  function clearMessage() {
    setMessage("");
    setMessageType(null);
  }

  function showSuccess(text: string) {
    setMessage(text);
    setMessageType("success");
  }

  function showError(text: string) {
    setMessage(text);
    setMessageType("error");
  }

  // =====================================================
  // LOAD DATA
  // =====================================================

  async function loadPhotos(manageLoading = true) {
    if (manageLoading) {
      setPhotoLoading(true);
    }

    const { data, error } = await supabase
      .from(photoTable)
      .select("id, url, is_cover")
      .eq(photoForeignKey, profileId)
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.log("LOAD PHOTOS ERROR:", error);
      showError(error.message);

      if (manageLoading) {
        setPhotoLoading(false);
      }

      return;
    }

    const loadedPhotos = (data ?? []) as ProfilePhoto[];

    setPhotos(loadedPhotos);

    setSelectedPhoto((currentPhoto) => {
      if (currentPhoto) {
        const refreshedPhoto = loadedPhotos.find(
          (photo) => photo.id === currentPhoto.id,
        );

        if (refreshedPhoto) {
          return refreshedPhoto;
        }
      }

      return (
        loadedPhotos.find((photo) => photo.is_cover) ?? loadedPhotos[0] ?? null
      );
    });

    if (manageLoading) {
      setPhotoLoading(false);
    }
  }

  async function loadVideos(manageLoading = true) {
    if (manageLoading) {
      setVideoLoading(true);
    }

    const { data, error } = await supabase
      .from(videoTable)
      .select(
        `
        id,
        url,
        storage_path,
        thumbnail_url,
        thumbnail_storage_path,
        duration_seconds,
        file_size_bytes,
        position,
        created_at
        `,
      )
      .eq(videoForeignKey, profileId)
      .order("position", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.log("LOAD VIDEOS ERROR:", error);
      showError(error.message);

      if (manageLoading) {
        setVideoLoading(false);
      }

      return;
    }

    setVideos((data ?? []) as ProfileVideo[]);

    if (manageLoading) {
      setVideoLoading(false);
    }
  }

  // =====================================================
  // PHOTO UPLOAD
  // =====================================================

  async function uploadSingleImage(
    image: ImagePicker.ImagePickerAsset,
    shouldBeCover: boolean,
  ) {
    if (!image.base64) {
      throw new Error("The selected photo could not be read.");
    }

    const mimeType = image.mimeType || "image/jpeg";

    const rawExtension = mimeType.split("/")[1] || "jpeg";

    const extension = rawExtension === "jpg" ? "jpeg" : rawExtension;

    const storagePath =
      `${role}/${profileId}-${Date.now()}-` +
      `${Math.random().toString(36).slice(2, 10)}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(storagePath, decode(image.base64), {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(storagePath);

    const { error: databaseError } = await supabase.from(photoTable).insert({
      [photoForeignKey]: profileId,
      url: publicUrlData.publicUrl,
      is_cover: shouldBeCover,
    });

    if (databaseError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);

      throw databaseError;
    }
  }

  async function pickAndUploadImages() {
    if (photoLoading) {
      return;
    }

    clearMessage();

    const remainingSlots = MAX_PHOTOS - photos.length;

    if (remainingSlots <= 0) {
      showError(`Maximum of ${MAX_PHOTOS} photos reached.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showError("Permission to access your photos is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setPhotoLoading(true);

    try {
      const profileHadNoPhotos = photos.length === 0;

      for (let index = 0; index < result.assets.length; index += 1) {
        await uploadSingleImage(
          result.assets[index],
          profileHadNoPhotos && index === 0,
        );
      }

      await loadPhotos(false);

      showSuccess("Photos uploaded successfully.");
    } catch (error) {
      console.log("UPLOAD PHOTOS ERROR:", error);

      showError(
        error instanceof Error ? error.message : "Photo upload failed.",
      );
    } finally {
      setPhotoLoading(false);
    }
  }

  async function setAsCover(photo: ProfilePhoto) {
    if (photoLoading || photo.is_cover) {
      return;
    }

    clearMessage();
    setPhotoLoading(true);

    const { error: resetError } = await supabase
      .from(photoTable)
      .update({
        is_cover: false,
      })
      .eq(photoForeignKey, profileId);

    if (resetError) {
      showError(resetError.message);
      setPhotoLoading(false);
      return;
    }

    const { error: coverError } = await supabase
      .from(photoTable)
      .update({
        is_cover: true,
      })
      .eq("id", photo.id)
      .eq(photoForeignKey, profileId);

    if (coverError) {
      showError(coverError.message);
      setPhotoLoading(false);
      return;
    }

    await loadPhotos(false);

    showSuccess("Cover photo updated.");
    setPhotoLoading(false);
  }

  async function deletePhoto(photo: ProfilePhoto) {
    if (photoLoading) {
      return;
    }

    if (photos.length <= MIN_PHOTOS) {
      showError(`Your profile must keep at least ${MIN_PHOTOS} photos.`);
      return;
    }

    clearMessage();
    setPhotoLoading(true);

    const storageMarker = `/${PHOTO_BUCKET}/`;

    const markerPosition = photo.url.indexOf(storageMarker);

    const storagePath =
      markerPosition >= 0
        ? decodeURIComponent(
            photo.url.slice(markerPosition + storageMarker.length),
          )
        : null;

    const { error: databaseError } = await supabase
      .from(photoTable)
      .delete()
      .eq("id", photo.id)
      .eq(photoForeignKey, profileId);

    if (databaseError) {
      showError(databaseError.message);
      setPhotoLoading(false);
      return;
    }

    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .remove([storagePath]);

      if (storageError) {
        console.log("PHOTO STORAGE DELETE ERROR:", storageError);
      }
    }

    const remainingPhotos = photos.filter((item) => item.id !== photo.id);

    if (photo.is_cover && remainingPhotos.length > 0) {
      const { error: newCoverError } = await supabase
        .from(photoTable)
        .update({
          is_cover: true,
        })
        .eq("id", remainingPhotos[0].id)
        .eq(photoForeignKey, profileId);

      if (newCoverError) {
        console.log("NEW COVER ERROR:", newCoverError);
      }
    }

    await loadPhotos(false);

    showSuccess("Photo deleted.");
    setPhotoLoading(false);
  }

  function confirmDeletePhoto(photo: ProfilePhoto) {
    Alert.alert("Delete photo", "Are you sure you want to delete this photo?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deletePhoto(photo);
        },
      },
    ]);
  }

  // =====================================================
  // VIDEO UPLOAD
  // =====================================================

  async function pickAndUploadVideo() {
    if (videoLoading || videos.length >= MAX_VIDEOS) {
      return;
    }

    clearMessage();

    if (!authenticatedUserId) {
      showError("The authenticated user could not be found.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showError("Permission to access your media library is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1,
      videoMaxDuration: MAX_VIDEO_DURATION_SECONDS,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];

    const validationError = validateVideo(asset);

    if (validationError) {
      showError(validationError);
      return;
    }

    await uploadVideo(asset);
  }

  function validateVideo(asset: ImagePicker.ImagePickerAsset): string | null {
    const durationSeconds =
      asset.duration !== null && asset.duration !== undefined
        ? asset.duration / 1000
        : null;

    if (
      durationSeconds !== null &&
      durationSeconds > MAX_VIDEO_DURATION_SECONDS
    ) {
      return `The video cannot be longer than ${MAX_VIDEO_DURATION_SECONDS} seconds.`;
    }

    if (asset.fileSize !== undefined && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
      return "The video cannot be larger than 50 MB.";
    }

    const mimeType = asset.mimeType?.toLowerCase() ?? "";

    const supportedMimeTypes = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-m4v",
    ];

    if (mimeType && !supportedMimeTypes.includes(mimeType)) {
      return "Supported formats are MP4, MOV and WebM.";
    }

    return null;
  }

  async function uploadVideo(asset: ImagePicker.ImagePickerAsset) {
    if (!authenticatedUserId || videoLoading) {
      return;
    }

    clearMessage();
    setVideoLoading(true);

    let uploadedStoragePath: string | null = null;

    try {
      const extension = getVideoExtension(asset);

      const mimeType = getVideoMimeType(asset, extension);

      const randomPart = Math.random().toString(36).slice(2, 10);

      const fileName = `${Date.now()}-${randomPart}.` + extension;

      const storagePath = `${authenticatedUserId}/${role}/` + fileName;

      uploadedStoragePath = storagePath;

      /*
       * Il picker Android può restituire URI file://
       * oppure content://. Expo FileSystem legge il
       * contenuto locale e lo converte in Base64.
       */
      const videoBase64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (!videoBase64) {
        throw new Error("The selected video could not be read.");
      }

      const videoArrayBuffer = decode(videoBase64);

      if (videoArrayBuffer.byteLength > MAX_VIDEO_SIZE_BYTES) {
        throw new Error("The video cannot be larger than 50 MB.");
      }

      const { error: uploadError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(storagePath, videoArrayBuffer, {
          contentType: mimeType,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(VIDEO_BUCKET)
        .getPublicUrl(storagePath);

      if (!publicUrlData.publicUrl) {
        throw new Error("The public video URL could not be generated.");
      }

      const durationSeconds =
        asset.duration !== null && asset.duration !== undefined
          ? Number((asset.duration / 1000).toFixed(2))
          : null;

      const { error: databaseError } = await supabase.from(videoTable).insert({
        [videoForeignKey]: profileId,
        url: publicUrlData.publicUrl,
        storage_path: storagePath,
        thumbnail_url: null,
        thumbnail_storage_path: null,
        duration_seconds: durationSeconds,
        file_size_bytes: asset.fileSize ?? videoArrayBuffer.byteLength,
        position: videos.length,
      });

      if (databaseError) {
        throw databaseError;
      }

      await loadVideos(false);

      showSuccess("Video uploaded successfully.");
    } catch (error) {
      console.log("UPLOAD VIDEO ERROR:", error);

      if (uploadedStoragePath) {
        const { error: cleanupError } = await supabase.storage
          .from(VIDEO_BUCKET)
          .remove([uploadedStoragePath]);

        if (cleanupError) {
          console.log("VIDEO CLEANUP ERROR:", cleanupError);
        }
      }

      showError(
        error instanceof Error
          ? error.message
          : "The video could not be uploaded.",
      );
    } finally {
      setVideoLoading(false);
    }
  }

  function getVideoExtension(asset: ImagePicker.ImagePickerAsset) {
    const source = asset.fileName || asset.uri.split("?")[0];

    const extension = source.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];

    if (extension && ["mp4", "mov", "webm", "m4v"].includes(extension)) {
      return extension;
    }

    const mimeType = asset.mimeType?.toLowerCase();

    if (mimeType === "video/quicktime") {
      return "mov";
    }

    if (mimeType === "video/webm") {
      return "webm";
    }

    if (mimeType === "video/x-m4v") {
      return "m4v";
    }

    return "mp4";
  }

  function getVideoMimeType(
    asset: ImagePicker.ImagePickerAsset,
    extension: string,
  ) {
    if (asset.mimeType?.startsWith("video/")) {
      return asset.mimeType;
    }

    if (extension === "mov") {
      return "video/quicktime";
    }

    if (extension === "webm") {
      return "video/webm";
    }

    if (extension === "m4v") {
      return "video/x-m4v";
    }

    return "video/mp4";
  }

  async function deleteVideo(video: ProfileVideo) {
    if (videoLoading || deletingVideoId) {
      return;
    }

    clearMessage();
    setDeletingVideoId(video.id);

    try {
      const { error: databaseError } = await supabase
        .from(videoTable)
        .delete()
        .eq("id", video.id)
        .eq(videoForeignKey, profileId);

      if (databaseError) {
        throw databaseError;
      }

      const storagePaths = [
        video.storage_path,
        video.thumbnail_storage_path,
      ].filter((path): path is string => Boolean(path));

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(VIDEO_BUCKET)
          .remove(storagePaths);

        if (storageError) {
          console.log("VIDEO STORAGE DELETE ERROR:", storageError);
        }
      }

      await loadVideos(false);

      showSuccess("Video deleted.");
    } catch (error) {
      console.log("DELETE VIDEO ERROR:", error);

      showError(
        error instanceof Error
          ? error.message
          : "The video could not be deleted.",
      );
    } finally {
      setDeletingVideoId(null);
    }
  }

  function confirmDeleteVideo(video: ProfileVideo) {
    Alert.alert("Delete video", "Are you sure you want to delete this video?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteVideo(video);
        },
      },
    ]);
  }

  function formatDuration(seconds: number | null) {
    if (seconds === null || Number.isNaN(seconds)) {
      return "Unknown";
    }

    const roundedSeconds = Math.round(seconds);

    const minutes = Math.floor(roundedSeconds / 60);

    const remainingSeconds = roundedSeconds % 60;

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  function formatFileSize(bytes: number | null) {
    if (bytes === null || Number.isNaN(bytes)) {
      return "Unknown";
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (initialLoading) {
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
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backButton}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Manage media</Text>

        <View style={styles.headerPlaceholder} />
      </View>

      <Text style={styles.subtitle}>
        Add photos and short videos to present your profile and professional
        skills.
      </Text>

      {message ? (
        <Text
          style={[
            styles.message,
            messageType === "success"
              ? styles.successMessage
              : styles.errorMessage,
          ]}
        >
          {message}
        </Text>
      ) : null}

      {/* PHOTOS */}

      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderContent}>
          <Text style={styles.sectionTitle}>Photos</Text>

          <Text style={styles.sectionDescription}>
            Add between {MIN_PHOTOS} and {MAX_PHOTOS} photos.
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {photos.length}/{MAX_PHOTOS}
          </Text>
        </View>
      </View>

      <View style={styles.previewCard}>
        {selectedPhoto ? (
          <Image
            source={{
              uri: selectedPhoto.url,
            }}
            style={styles.previewImage}
          />
        ) : (
          <View style={styles.emptyPreview}>
            <Text style={styles.emptyPreviewIcon}>📷</Text>

            <Text style={styles.emptyPreviewText}>Add your first photos</Text>
          </View>
        )}

        {selectedPhoto ? (
          <View style={styles.photoActions}>
            <Pressable
              style={[
                styles.coverButton,
                selectedPhoto.is_cover && styles.disabledAction,
              ]}
              disabled={Boolean(selectedPhoto.is_cover) || photoLoading}
              onPress={() => void setAsCover(selectedPhoto)}
            >
              <Text style={styles.coverButtonText}>
                {selectedPhoto.is_cover ? "Current cover" : "Set as cover"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.deletePhotoButton}
              disabled={photoLoading}
              onPress={() => confirmDeletePhoto(selectedPhoto)}
            >
              <Text style={styles.deletePhotoButtonText}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.photoGrid}>
        {Array.from({
          length: MAX_PHOTOS,
        }).map((_, index) => {
          const photo = photos[index];

          if (!photo) {
            return (
              <Pressable
                key={`empty-photo-${index}`}
                style={styles.emptyPhotoSlot}
                disabled={photoLoading}
                onPress={() => void pickAndUploadImages()}
              >
                <Text style={styles.plus}>+</Text>

                <Text style={styles.slotNumber}>{index + 1}</Text>
              </Pressable>
            );
          }

          const isSelected = selectedPhoto?.id === photo.id;

          return (
            <Pressable
              key={photo.id}
              style={[styles.photoSlot, isSelected && styles.selectedPhotoSlot]}
              onPress={() => setSelectedPhoto(photo)}
            >
              <Image
                source={{
                  uri: photo.url,
                }}
                style={styles.photoSlotImage}
              />

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
          Add at least {MIN_PHOTOS - photos.length} more{" "}
          {MIN_PHOTOS - photos.length === 1 ? "photo" : "photos"}.
        </Text>
      ) : (
        <Text style={styles.requirementComplete}>
          Minimum photo requirement completed.
        </Text>
      )}

      <Pressable
        style={[
          styles.primaryButton,
          (photoLoading || photos.length >= MAX_PHOTOS) &&
            styles.disabledAction,
        ]}
        disabled={photoLoading || photos.length >= MAX_PHOTOS}
        onPress={() => void pickAndUploadImages()}
      >
        {photoLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {photos.length >= MAX_PHOTOS
              ? "Maximum photos reached"
              : "Add photos"}
          </Text>
        )}
      </Pressable>

      {/* VIDEOS */}

      <View style={styles.sectionDivider} />

      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderContent}>
          <Text style={styles.sectionTitle}>Videos</Text>

          <Text style={styles.sectionDescription}>
            Maximum {MAX_VIDEOS} videos, {MAX_VIDEO_DURATION_SECONDS} seconds
            each.
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {videos.length}/{MAX_VIDEOS}
          </Text>
        </View>
      </View>

      {videos.length === 0 ? (
        <View style={styles.emptyVideoCard}>
          <Text style={styles.emptyVideoIcon}>🎥</Text>

          <Text style={styles.emptyVideoTitle}>No videos yet</Text>

          <Text style={styles.emptyVideoText}>
            Upload a short presentation or show your work behind the bar.
          </Text>
        </View>
      ) : (
        <View style={styles.videoList}>
          {videos.map((video, index) => (
            <ProfileVideoCard
              key={video.id}
              video={video}
              index={index}
              deleting={deletingVideoId === video.id}
              onDelete={() => confirmDeleteVideo(video)}
              formatDuration={formatDuration}
              formatFileSize={formatFileSize}
            />
          ))}
        </View>
      )}

      <Pressable
        style={[
          styles.videoUploadButton,
          (videoLoading || videos.length >= MAX_VIDEOS) &&
            styles.disabledAction,
        ]}
        disabled={videoLoading || videos.length >= MAX_VIDEOS}
        onPress={() => void pickAndUploadVideo()}
      >
        {videoLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={styles.videoUploadIcon}>＋</Text>

            <Text style={styles.videoUploadButtonText}>
              {videos.length >= MAX_VIDEOS
                ? "Maximum videos reached"
                : "Add video"}
            </Text>
          </>
        )}
      </Pressable>

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>Video requirements</Text>

        <Text style={styles.tipText}>• Maximum 30 seconds</Text>

        <Text style={styles.tipText}>• Maximum 50 MB</Text>

        <Text style={styles.tipText}>• MP4, MOV or WebM</Text>

        <Text style={styles.tipText}>
          • Avoid filming customers without permission
        </Text>
      </View>
    </ScrollView>
  );
}

type ProfileVideoCardProps = {
  video: ProfileVideo;
  index: number;
  deleting: boolean;
  onDelete: () => void;
  formatDuration: (seconds: number | null) => string;
  formatFileSize: (bytes: number | null) => string;
};

function ProfileVideoCard({
  video,
  index,
  deleting,
  onDelete,
  formatDuration,
  formatFileSize,
}: ProfileVideoCardProps) {
  const player = useVideoPlayer(video.url, (createdPlayer) => {
    createdPlayer.loop = false;
    createdPlayer.muted = false;
  });

  return (
    <View style={styles.videoCard}>
      <View style={styles.videoCardHeader}>
        <Text style={styles.videoCardTitle}>Video {index + 1}</Text>

        <View style={styles.videoNumberBadge}>
          <Text style={styles.videoNumberBadgeText}>{index + 1}</Text>
        </View>
      </View>

      <View style={styles.playerWrapper}>
        <VideoView
          player={player}
          style={styles.videoPlayer}
          nativeControls
          contentFit="contain"
        />
      </View>

      <View style={styles.metadataRow}>
        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>Duration</Text>

          <Text style={styles.metadataValue}>
            {formatDuration(video.duration_seconds)}
          </Text>
        </View>

        <View style={styles.metadataDivider} />

        <View style={styles.metadataItem}>
          <Text style={styles.metadataLabel}>File size</Text>

          <Text style={styles.metadataValue}>
            {formatFileSize(video.file_size_bytes)}
          </Text>
        </View>
      </View>

      <Pressable
        style={[styles.deleteVideoButton, deleting && styles.disabledAction]}
        disabled={deleting}
        onPress={onDelete}
      >
        {deleting ? (
          <ActivityIndicator color="#B00020" />
        ) : (
          <Text style={styles.deleteVideoButtonText}>Delete video</Text>
        )}
      </Pressable>
    </View>
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
    fontWeight: "700",
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#2C2C2C",
  },

  headerPlaceholder: {
    width: 45,
  },

  subtitle: {
    marginTop: 14,
    marginBottom: 18,
    color: "#666666",
    textAlign: "center",
    lineHeight: 21,
  },

  message: {
    marginBottom: 16,
    textAlign: "center",
    fontWeight: "700",
  },

  successMessage: {
    color: "#2E7D32",
  },

  errorMessage: {
    color: "#B00020",
  },

  sectionHeader: {
    marginTop: 6,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  sectionHeaderContent: {
    flex: 1,
    marginRight: 12,
  },

  sectionTitle: {
    color: "#2C2C2C",
    fontSize: 22,
    fontWeight: "800",
  },

  sectionDescription: {
    marginTop: 4,
    color: "#777777",
    fontSize: 12,
    lineHeight: 17,
  },

  countBadge: {
    minWidth: 48,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    backgroundColor: "#EEE9E2",
    alignItems: "center",
    justifyContent: "center",
  },

  countBadgeText: {
    color: "#5F5A54",
    fontSize: 12,
    fontWeight: "900",
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

  emptyPreviewIcon: {
    fontSize: 48,
  },

  emptyPreviewText: {
    marginTop: 10,
    color: "#666666",
    fontSize: 17,
  },

  photoActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },

  coverButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
  },

  coverButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  deletePhotoButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B00020",
    alignItems: "center",
  },

  deletePhotoButtonText: {
    color: "#B00020",
    fontWeight: "800",
  },

  photoGrid: {
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

  selectedPhotoSlot: {
    borderColor: "#2C2C2C",
  },

  photoSlotImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },

  emptyPhotoSlot: {
    width: "31%",
    aspectRatio: 0.8,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#AAAAAA",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  plus: {
    fontSize: 32,
    color: "#777777",
  },

  slotNumber: {
    position: "absolute",
    bottom: 8,
    color: "#777777",
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

  primaryButton: {
    backgroundColor: "#2C2C2C",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },

  disabledAction: {
    opacity: 0.45,
  },

  sectionDivider: {
    height: 1,
    marginVertical: 30,
    backgroundColor: "#DDD7CF",
  },

  emptyVideoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 26,
    alignItems: "center",
  },

  emptyVideoIcon: {
    fontSize: 48,
  },

  emptyVideoTitle: {
    marginTop: 12,
    color: "#2C2C2C",
    fontSize: 20,
    fontWeight: "800",
  },

  emptyVideoText: {
    marginTop: 8,
    color: "#777777",
    lineHeight: 20,
    textAlign: "center",
  },

  videoList: {
    gap: 18,
  },

  videoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 15,
  },

  videoCardHeader: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  videoCardTitle: {
    flex: 1,
    color: "#2C2C2C",
    fontSize: 18,
    fontWeight: "800",
  },

  videoNumberBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    backgroundColor: "#EEE9E2",
    alignItems: "center",
    justifyContent: "center",
  },

  videoNumberBadgeText: {
    color: "#5F5A54",
    fontSize: 12,
    fontWeight: "900",
  },

  playerWrapper: {
    width: "100%",
    aspectRatio: 9 / 16,
    maxHeight: 520,
    overflow: "hidden",
    borderRadius: 17,
    backgroundColor: "#111111",
  },

  videoPlayer: {
    width: "100%",
    height: "100%",
  },

  metadataRow: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 13,
    backgroundColor: "#F7F4EF",
    flexDirection: "row",
    alignItems: "center",
  },

  metadataItem: {
    flex: 1,
    alignItems: "center",
  },

  metadataLabel: {
    color: "#888888",
    fontSize: 11,
  },

  metadataValue: {
    marginTop: 4,
    color: "#2C2C2C",
    fontSize: 13,
    fontWeight: "800",
  },

  metadataDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#DDD7CF",
  },

  deleteVideoButton: {
    minHeight: 48,
    marginTop: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#B00020",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteVideoButtonText: {
    color: "#B00020",
    fontSize: 14,
    fontWeight: "800",
  },

  videoUploadButton: {
    minHeight: 56,
    marginTop: 18,
    borderRadius: 15,
    backgroundColor: "#2C2C2C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  videoUploadIcon: {
    color: "#FFFFFF",
    fontSize: 26,
  },

  videoUploadButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  tipCard: {
    marginTop: 20,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    backgroundColor: "#FFFFFF",
  },

  tipTitle: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 7,
  },

  tipText: {
    color: "#777777",
    fontSize: 13,
    lineHeight: 21,
  },
});
