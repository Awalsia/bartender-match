import { supabase } from "@/lib/supabase";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from "react-native";

type BartenderVideoRow = {
  id: string;
  bartender_id: string;
  url: string;
  storage_path: string;
  thumbnail_url: string | null;
  thumbnail_storage_path: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  position: number;
  created_at: string;
};

type VideoAsset = ImagePicker.ImagePickerAsset;

const MAX_VIDEO_COUNT = 2;
const MAX_VIDEO_DURATION_SECONDS = 30;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
const VIDEO_BUCKET = "profile-videos";

export default function ManageVideosScreen() {
  const [bartenderId, setBartenderId] = useState<string | null>(null);

  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(
    null,
  );

  const [videos, setVideos] = useState<BartenderVideoRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  const [message, setMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void loadVideos();
    }, []),
  );

  async function loadVideos() {
    setLoading(true);
    setMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD MANAGE VIDEOS USER ERROR:", userError);

      router.replace("/(auth)/login");
      return;
    }

    const userId = userData.user.id;

    setAuthenticatedUserId(userId);

    const { data: profileData, error: profileError } = await supabase
      .from("bartender_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profileData) {
      console.log("LOAD VIDEO BARTENDER PROFILE ERROR:", profileError);

      setMessage(
        profileError?.message ?? "Bartender profile could not be found.",
      );

      setLoading(false);
      return;
    }

    const profileId = profileData.id as string;

    setBartenderId(profileId);

    const { data, error } = await supabase
      .from("bartender_videos")
      .select(
        `
        id,
        bartender_id,
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
      .eq("bartender_id", profileId)
      .order("position", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.log("LOAD BARTENDER VIDEOS ERROR:", error);

      setMessage(error.message);
      setLoading(false);
      return;
    }

    setVideos((data ?? []) as BartenderVideoRow[]);

    setLoading(false);
  }

  async function pickVideo() {
    if (picking || uploading) {
      return;
    }

    setMessage("");

    if (videos.length >= MAX_VIDEO_COUNT) {
      setMessage(`You can upload a maximum of ${MAX_VIDEO_COUNT} videos.`);

      return;
    }

    setPicking(true);

    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        setMessage("Permission to access your media library is required.");

        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        allowsMultipleSelection: false,
        quality: 1,
        videoMaxDuration: MAX_VIDEO_DURATION_SECONDS,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const selectedVideo = result.assets[0];

      const validationError = validateSelectedVideo(selectedVideo);

      if (validationError) {
        setMessage(validationError);
        return;
      }

      await uploadVideo(selectedVideo);
    } catch (error) {
      console.log("PICK VIDEO ERROR:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "The video could not be selected.",
      );
    } finally {
      setPicking(false);
    }
  }

  function validateSelectedVideo(asset: VideoAsset): string | null {
    if (
      asset.type !== "video" &&
      asset.type !== null &&
      asset.type !== undefined
    ) {
      return "Please select a video file.";
    }

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

  async function uploadVideo(asset: VideoAsset) {
    if (!bartenderId || !authenticatedUserId || uploading) {
      return;
    }

    setUploading(true);
    setMessage("");

    let uploadedStoragePath: string | null = null;

    try {
      const fileExtension = getFileExtension(asset);

      const mimeType = getVideoMimeType(asset, fileExtension);

      const randomPart = Math.random().toString(36).slice(2, 10);

      const fileName = `${Date.now()}-${randomPart}.` + fileExtension;

      const storagePath = `${authenticatedUserId}/bartender/` + fileName;

      uploadedStoragePath = storagePath;

      const response = await fetch(asset.uri);

      if (!response.ok) {
        throw new Error("The selected video could not be read.");
      }

      const videoArrayBuffer = await response.arrayBuffer();

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

      const publicUrl = publicUrlData.publicUrl;

      if (!publicUrl) {
        throw new Error("The public video URL could not be created.");
      }

      const durationSeconds =
        asset.duration !== null && asset.duration !== undefined
          ? Number((asset.duration / 1000).toFixed(2))
          : null;

      const nextPosition = videos.length;

      const { error: databaseError } = await supabase
        .from("bartender_videos")
        .insert({
          bartender_id: bartenderId,
          url: publicUrl,
          storage_path: storagePath,
          thumbnail_url: null,
          thumbnail_storage_path: null,
          duration_seconds: durationSeconds,
          file_size_bytes: asset.fileSize ?? videoArrayBuffer.byteLength,
          position: nextPosition,
        });

      if (databaseError) {
        throw databaseError;
      }

      setMessage("Video uploaded successfully.");

      await loadVideos();
    } catch (error) {
      console.log("UPLOAD VIDEO ERROR:", error);

      if (uploadedStoragePath) {
        await supabase.storage.from(VIDEO_BUCKET).remove([uploadedStoragePath]);
      }

      setMessage(
        error instanceof Error
          ? error.message
          : "The video could not be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  }

  function getFileExtension(asset: VideoAsset) {
    const fileName = asset.fileName?.toLowerCase() ?? "";

    const uriWithoutQuery = asset.uri.split("?")[0].toLowerCase();

    const source = fileName || uriWithoutQuery;

    const extensionMatch = source.match(/\.([a-z0-9]+)$/);

    const extension = extensionMatch?.[1] ?? "";

    if (["mp4", "mov", "webm", "m4v"].includes(extension)) {
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

  function getVideoMimeType(asset: VideoAsset, extension: string) {
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

  function confirmDeleteVideo(video: BartenderVideoRow) {
    Alert.alert(
      "Delete video",
      "Are you sure you want to remove this video from your profile?",
      [
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
      ],
    );
  }

  async function deleteVideo(video: BartenderVideoRow) {
    if (!bartenderId || deletingVideoId || uploading) {
      return;
    }

    setDeletingVideoId(video.id);
    setMessage("");

    try {
      const { error: databaseError } = await supabase
        .from("bartender_videos")
        .delete()
        .eq("id", video.id)
        .eq("bartender_id", bartenderId);

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
          console.log("DELETE VIDEO STORAGE ERROR:", storageError);
        }
      }

      setMessage("Video deleted.");

      await loadVideos();
    } catch (error) {
      console.log("DELETE VIDEO ERROR:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "The video could not be deleted.",
      );
    } finally {
      setDeletingVideoId(null);
    }
  }

  function formatDuration(durationSeconds: number | null) {
    if (durationSeconds === null || Number.isNaN(durationSeconds)) {
      return "Duration unavailable";
    }

    const totalSeconds = Math.round(durationSeconds);

    const minutes = Math.floor(totalSeconds / 60);

    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function formatFileSize(fileSizeBytes: number | null) {
    if (fileSizeBytes === null || Number.isNaN(fileSizeBytes)) {
      return "Size unavailable";
    }

    const megabytes = fileSizeBytes / (1024 * 1024);

    return `${megabytes.toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading videos...</Text>
      </View>
    );
  }

  const canUploadMore = videos.length < MAX_VIDEO_COUNT;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Profile videos</Text>

        <Text style={styles.counter}>
          {videos.length}/{MAX_VIDEO_COUNT}
        </Text>
      </View>

      <Text style={styles.subtitle}>
        Show your cocktail skills, presentation or work behind the bar.
      </Text>

      <View style={styles.rulesCard}>
        <Text style={styles.rulesTitle}>Video requirements</Text>

        <Text style={styles.ruleText}>• Maximum {MAX_VIDEO_COUNT} videos</Text>

        <Text style={styles.ruleText}>
          • Maximum {MAX_VIDEO_DURATION_SECONDS} seconds
        </Text>

        <Text style={styles.ruleText}>• Maximum 50 MB</Text>

        <Text style={styles.ruleText}>• MP4, MOV or WebM</Text>
      </View>

      <Pressable
        style={[
          styles.addButton,
          (!canUploadMore || uploading || picking) && styles.buttonDisabled,
        ]}
        onPress={() => void pickVideo()}
        disabled={!canUploadMore || uploading || picking}
      >
        {uploading || picking ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={styles.addIcon}>＋</Text>

            <Text style={styles.addButtonText}>
              {canUploadMore ? "Add video" : "Video limit reached"}
            </Text>
          </>
        )}
      </Pressable>

      {uploading ? (
        <View style={styles.uploadingCard}>
          <ActivityIndicator color="#2C2C2C" />

          <View style={styles.uploadingContent}>
            <Text style={styles.uploadingTitle}>Uploading video</Text>

            <Text style={styles.uploadingDescription}>
              Keep the app open until the upload is complete.
            </Text>
          </View>
        </View>
      ) : null}

      {message ? (
        <Text
          style={[
            styles.message,
            message.toLowerCase().includes("success") ||
            message.toLowerCase().includes("deleted")
              ? styles.successMessage
              : styles.errorMessage,
          ]}
        >
          {message}
        </Text>
      ) : null}

      {videos.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎥</Text>

          <Text style={styles.emptyTitle}>No videos yet</Text>

          <Text style={styles.emptyText}>
            Upload a short introduction or show how you prepare a cocktail.
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

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>Video tip</Text>

        <Text style={styles.tipText}>
          Use good lighting, keep the phone vertical and make the first few
          seconds interesting. Avoid including customers without their
          permission.
        </Text>
      </View>
    </ScrollView>
  );
}

type ProfileVideoCardProps = {
  video: BartenderVideoRow;
  index: number;
  deleting: boolean;
  onDelete: () => void;
  formatDuration: (durationSeconds: number | null) => string;
  formatFileSize: (fileSizeBytes: number | null) => string;
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
      <View style={styles.videoHeader}>
        <Text style={styles.videoTitle}>Video {index + 1}</Text>

        <View style={styles.videoNumberBadge}>
          <Text style={styles.videoNumberBadgeText}>{index + 1}</Text>
        </View>
      </View>

      <View style={styles.playerContainer}>
        <VideoView
          player={player}
          style={styles.videoPlayer}
          nativeControls
          contentFit="contain"
          allowsFullscreen
          allowsPictureInPicture
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
        style={[styles.deleteButton, deleting && styles.buttonDisabled]}
        onPress={onDelete}
        disabled={deleting}
      >
        {deleting ? (
          <ActivityIndicator color="#B00020" />
        ) : (
          <Text style={styles.deleteButtonText}>Delete video</Text>
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
    padding: 20,
    paddingTop: 54,
    paddingBottom: 44,
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
    fontSize: 25,
    fontWeight: "800",
  },

  counter: {
    minWidth: 42,
    color: "#666666",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right",
  },

  subtitle: {
    marginTop: 12,
    marginBottom: 18,
    color: "#666666",
    textAlign: "center",
    lineHeight: 21,
  },

  rulesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 17,
    marginBottom: 16,
  },

  rulesTitle: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 9,
  },

  ruleText: {
    color: "#666666",
    fontSize: 13,
    lineHeight: 21,
  },

  addButton: {
    minHeight: 56,
    borderRadius: 15,
    backgroundColor: "#2C2C2C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  addIcon: {
    color: "#FFFFFF",
    fontSize: 26,
  },

  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  uploadingCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  uploadingContent: {
    flex: 1,
    marginLeft: 13,
  },

  uploadingTitle: {
    color: "#2C2C2C",
    fontSize: 15,
    fontWeight: "800",
  },

  uploadingDescription: {
    marginTop: 3,
    color: "#777777",
    fontSize: 12,
    lineHeight: 17,
  },

  message: {
    marginTop: 14,
    textAlign: "center",
    fontWeight: "700",
  },

  successMessage: {
    color: "#2E7D32",
  },

  errorMessage: {
    color: "#B00020",
  },

  videoList: {
    marginTop: 18,
    gap: 18,
  },

  videoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 15,
  },

  videoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  videoTitle: {
    flex: 1,
    color: "#2C2C2C",
    fontSize: 18,
    fontWeight: "800",
  },

  videoNumberBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EEE9E2",
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  videoNumberBadgeText: {
    color: "#5F5A54",
    fontSize: 12,
    fontWeight: "900",
  },

  playerContainer: {
    width: "100%",
    aspectRatio: 9 / 16,
    maxHeight: 520,
    borderRadius: 17,
    overflow: "hidden",
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

  deleteButton: {
    minHeight: 48,
    marginTop: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#B00020",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteButtonText: {
    color: "#B00020",
    fontSize: 14,
    fontWeight: "800",
  },

  emptyCard: {
    marginTop: 18,
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

  tipCard: {
    marginTop: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 18,
  },

  tipTitle: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
  },

  tipText: {
    marginTop: 7,
    color: "#777777",
    fontSize: 13,
    lineHeight: 20,
  },
});
