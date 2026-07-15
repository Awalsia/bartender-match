import type { Bartender } from "@/types/bartender";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  bartender: Bartender;
  onPress?: () => void;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 55;

export default function BartenderCard({ bartender, onPress }: Props) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [changingPhoto, setChangingPhoto] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const photoUrls = useMemo(() => {
    const availablePhotos = bartender.photoUrls.filter(Boolean);

    if (
      bartender.coverPhotoUrl &&
      !availablePhotos.includes(bartender.coverPhotoUrl)
    ) {
      return [bartender.coverPhotoUrl, ...availablePhotos];
    }

    if (availablePhotos.length > 0) {
      return availablePhotos;
    }

    return bartender.coverPhotoUrl ? [bartender.coverPhotoUrl] : [];
  }, [bartender.coverPhotoUrl, bartender.photoUrls]);

  useEffect(() => {
    setCurrentPhotoIndex(0);
    translateX.setValue(0);
    opacity.setValue(1);
  }, [bartender.id, opacity, translateX]);

  const fullName =
    [bartender.firstName, bartender.lastName].filter(Boolean).join(" ") ||
    "Bartender";

  const experience = bartender.yearsExperience ?? 0;
  const currentPhotoUrl = photoUrls[currentPhotoIndex] ?? null;

  const hasPreviousPhoto = currentPhotoIndex > 0;
  const hasNextPhoto = currentPhotoIndex < photoUrls.length - 1;

  function animatePhotoChange(nextIndex: number, direction: "left" | "right") {
    if (changingPhoto) return;

    if (nextIndex < 0 || nextIndex >= photoUrls.length) {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }).start();

      return;
    }

    setChangingPhoto(true);

    const exitPosition = direction === "left" ? -SCREEN_WIDTH : SCREEN_WIDTH;

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: exitPosition,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.25,
        duration: 170,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentPhotoIndex(nextIndex);

      translateX.setValue(
        direction === "left" ? SCREEN_WIDTH * 0.3 : -SCREEN_WIDTH * 0.3,
      );

      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          speed: 20,
          bounciness: 0,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 170,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setChangingPhoto(false);
      });
    });
  }

  function showPreviousPhoto() {
    if (!hasPreviousPhoto) return;

    animatePhotoChange(currentPhotoIndex - 1, "right");
  }

  function showNextPhoto() {
    if (!hasNextPhoto) return;

    animatePhotoChange(currentPhotoIndex + 1, "left");
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const horizontalMovement = Math.abs(gestureState.dx);
          const verticalMovement = Math.abs(gestureState.dy);

          return (
            horizontalMovement > 8 && horizontalMovement > verticalMovement
          );
        },

        onPanResponderMove: (_, gestureState) => {
          if (changingPhoto) return;

          const draggingPastFirstPhoto =
            gestureState.dx > 0 && !hasPreviousPhoto;

          const draggingPastLastPhoto = gestureState.dx < 0 && !hasNextPhoto;

          const resistance =
            draggingPastFirstPhoto || draggingPastLastPhoto ? 0.18 : 1;

          translateX.setValue(gestureState.dx * resistance);
        },

        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx <= -SWIPE_THRESHOLD && hasNextPhoto) {
            showNextPhoto();
            return;
          }

          if (gestureState.dx >= SWIPE_THRESHOLD && hasPreviousPhoto) {
            showPreviousPhoto();
            return;
          }

          Animated.spring(translateX, {
            toValue: 0,
            speed: 20,
            bounciness: 5,
            useNativeDriver: true,
          }).start();
        },

        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [
      changingPhoto,
      currentPhotoIndex,
      hasNextPhoto,
      hasPreviousPhoto,
      photoUrls.length,
    ],
  );

  return (
    <View style={styles.card}>
      <View style={styles.imageContainer} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            styles.animatedImageContainer,
            {
              opacity,
              transform: [{ translateX }],
            },
          ]}
        >
          {currentPhotoUrl ? (
            <Image
              source={{ uri: currentPhotoUrl }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderIcon}>👤</Text>

              <Text style={styles.placeholderText}>No profile photos</Text>
            </View>
          )}
        </Animated.View>

        {photoUrls.length > 1 ? (
          <>
            <Pressable
              style={[
                styles.arrowButton,
                styles.leftArrow,
                !hasPreviousPhoto && styles.arrowButtonDisabled,
              ]}
              onPress={showPreviousPhoto}
              disabled={!hasPreviousPhoto || changingPhoto}
              hitSlop={10}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>

            <Pressable
              style={[
                styles.arrowButton,
                styles.rightArrow,
                !hasNextPhoto && styles.arrowButtonDisabled,
              ]}
              onPress={showNextPhoto}
              disabled={!hasNextPhoto || changingPhoto}
              hitSlop={10}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>

            <View style={styles.photoCountBadge}>
              <Text style={styles.photoCountText}>
                📷 {currentPhotoIndex + 1}/{photoUrls.length}
              </Text>
            </View>

            <View style={styles.photoIndicators}>
              {photoUrls.map((_, index) => (
                <View
                  key={`indicator-${index}`}
                  style={[
                    styles.photoIndicator,
                    index === currentPhotoIndex && styles.photoIndicatorActive,
                  ]}
                />
              ))}
            </View>
          </>
        ) : photoUrls.length === 1 ? (
          <View style={styles.photoCountBadge}>
            <Text style={styles.photoCountText}>📷 1/1</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.content,
          pressed && onPress ? styles.contentPressed : null,
        ]}
        onPress={onPress}
        disabled={!onPress}
      >
        <Text style={styles.name}>{fullName}</Text>

        <Text style={styles.location}>
          📍 {bartender.city ?? "City not specified"}
          {bartender.country ? `, ${bartender.country}` : ""}
        </Text>

        <View style={styles.detailsRow}>
          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Experience</Text>

            <Text style={styles.detailValue}>
              ⭐ {experience} {experience === 1 ? "year" : "years"}
            </Text>
          </View>

          <View style={styles.detailBox}>
            <Text style={styles.detailLabel}>Hourly rate</Text>

            <Text style={styles.detailValue}>
              💰{" "}
              {bartender.hourlyRate !== null
                ? `${bartender.hourlyRate} ${bartender.currency ?? "NOK"}`
                : "Not set"}
            </Text>
          </View>
        </View>

        {bartender.bio ? (
          <View style={styles.bioContainer}>
            <Text style={styles.bioTitle}>About</Text>

            <Text style={styles.bio} numberOfLines={3}>
              {bartender.bio}
            </Text>
          </View>
        ) : null}

        {onPress ? (
          <View style={styles.profileLinkContainer}>
            <Text style={styles.viewProfile}>View full profile →</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E0D8",
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  imageContainer: {
    width: "100%",
    height: 430,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#E5E0D8",
  },
  animatedImageContainer: {
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E5E0D8",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: {
    fontSize: 72,
    marginBottom: 10,
  },
  placeholderText: {
    color: "#666666",
    fontSize: 16,
  },
  arrowButton: {
    position: "absolute",
    top: "45%",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(44, 44, 44, 0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  leftArrow: {
    left: 12,
  },
  rightArrow: {
    right: 12,
  },
  arrowButtonDisabled: {
    opacity: 0.25,
  },
  arrowText: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "500",
    lineHeight: 38,
    marginTop: -3,
  },
  photoCountBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(44, 44, 44, 0.84)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 15,
  },
  photoCountText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  photoIndicators: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 14,
    flexDirection: "row",
    gap: 5,
  },
  photoIndicator: {
    flex: 1,
    height: 4,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.42)",
  },
  photoIndicatorActive: {
    backgroundColor: "#FFFFFF",
  },
  content: {
    padding: 20,
  },
  contentPressed: {
    opacity: 0.88,
  },
  name: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2C2C2C",
  },
  location: {
    marginTop: 7,
    fontSize: 16,
    color: "#666666",
  },
  detailsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  detailBox: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    borderRadius: 14,
    padding: 12,
  },
  detailLabel: {
    color: "#777777",
    fontSize: 12,
    marginBottom: 5,
  },
  detailValue: {
    color: "#2C2C2C",
    fontSize: 14,
    fontWeight: "700",
  },
  bioContainer: {
    marginTop: 18,
  },
  bioTitle: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  bio: {
    color: "#666666",
    fontSize: 15,
    lineHeight: 22,
  },
  profileLinkContainer: {
    alignItems: "flex-end",
    marginTop: 18,
  },
  viewProfile: {
    color: "#2C2C2C",
    fontWeight: "800",
  },
});
