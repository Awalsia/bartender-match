import { useVideoPlayer, VideoView } from "expo-video";
import { Image, StyleSheet, Text, View } from "react-native";

export type ProfilePhotoMedia = {
  id: string;
  type: "photo";
  url: string;
  isCover: boolean;
  createdAt: string | null;
};

export type ProfileVideoMedia = {
  id: string;
  type: "video";
  url: string;
  durationSeconds: number | null;
  position: number;
  createdAt: string | null;
};

export type ProfileMedia = ProfilePhotoMedia | ProfileVideoMedia;

type Props = {
  media: ProfileMedia[];
};

export default function ProfileMediaGallery({ media }: Props) {
  if (media.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>👤</Text>

        <Text style={styles.emptyText}>No profile media</Text>
      </View>
    );
  }

  return (
    <View style={styles.gallery}>
      {media.map((item, index) => {
        if (item.type === "video") {
          return (
            <ProfileVideoItem
              key={`video-${item.id}`}
              video={item}
              index={index}
              total={media.length}
            />
          );
        }

        return (
          <View key={`photo-${item.id}`} style={styles.mediaWrapper}>
            <Image
              source={{ uri: item.url }}
              style={styles.photo}
              resizeMode="cover"
            />

            <MediaCounter index={index} total={media.length} label="Photo" />

            {item.isCover ? (
              <View style={styles.coverBadge}>
                <Text style={styles.coverBadgeText}>Cover photo</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

type ProfileVideoItemProps = {
  video: ProfileVideoMedia;
  index: number;
  total: number;
};

function ProfileVideoItem({ video, index, total }: ProfileVideoItemProps) {
  const player = useVideoPlayer(
    {
      uri: video.url,
      useCaching: true,
    },
    (createdPlayer) => {
      createdPlayer.loop = false;
      createdPlayer.muted = false;
    },
  );

  return (
    <View style={styles.mediaWrapper}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
        surfaceType="textureView"
      />

      <MediaCounter index={index} total={total} label="Video" />

      <View style={styles.videoBadge}>
        <Text style={styles.videoBadgeText}>
          ▶ Video
          {video.durationSeconds !== null
            ? ` · ${formatDuration(video.durationSeconds)}`
            : ""}
        </Text>
      </View>
    </View>
  );
}

type MediaCounterProps = {
  index: number;
  total: number;
  label: "Photo" | "Video";
};

function MediaCounter({ index, total, label }: MediaCounterProps) {
  return (
    <View style={styles.counterBadge}>
      <Text style={styles.counterText}>
        {index + 1}/{total} · {label}
      </Text>
    </View>
  );
}

function formatDuration(seconds: number) {
  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);

  const remainingSeconds = roundedSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  gallery: {
    gap: 14,
  },

  mediaWrapper: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#111111",
  },

  photo: {
    width: "100%",
    aspectRatio: 0.8,
    backgroundColor: "#E5E0D8",
  },

  video: {
    width: "100%",
    aspectRatio: 9 / 16,
    maxHeight: 620,
    backgroundColor: "#111111",
  },

  counterBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(44, 44, 44, 0.82)",
  },

  counterText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  coverBadge: {
    position: "absolute",
    left: 14,
    bottom: 14,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(44, 44, 44, 0.82)",
  },

  coverBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  videoBadge: {
    position: "absolute",
    left: 14,
    bottom: 14,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(44, 44, 44, 0.82)",
  },

  videoBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  emptyContainer: {
    width: "100%",
    height: 400,
    borderRadius: 24,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyIcon: {
    fontSize: 72,
    marginBottom: 10,
  },

  emptyText: {
    color: "#666666",
    fontSize: 16,
  },
});
