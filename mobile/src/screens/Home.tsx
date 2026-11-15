import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ring } from "../components/Ring";
import { SettingsGlyph } from "../components/SettingsSheet";
import { imageSource, story } from "../data";
import { colors, ease, fonts } from "../theme";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function Home({ starting, onPlay, onSettings }: { starting: boolean; onPlay: () => void; onSettings: () => void }) {
  const home = story.useHome();
  const insets = useSafeAreaInsets();
  const drift = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(0)).current;
  const loaded = home !== undefined;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 16000, easing: ease.inOut, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 16000, easing: ease.inOut, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  useEffect(() => {
    if (loaded) Animated.timing(appear, { toValue: 1, duration: 900, delay: 150, easing: ease.out, useNativeDriver: true }).start();
  }, [loaded, appear]);

  const action = !home?.run ? "Play" : home.run.status === "active" ? "Continue" : story.canReplay ? "Play again" : "See your ending";

  return (
    <View style={styles.root}>
      {home && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.1] }) }] }]}
        >
          <Image source={imageSource(home.episode.posterUrl)} contentFit="cover" transition={600} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <LinearGradient
        colors={["rgba(7,7,10,0.62)", "rgba(7,7,10,0)", "rgba(7,7,10,0.55)", "rgba(7,7,10,0.96)"]}
        locations={[0, 0.24, 0.56, 0.92]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.top, { paddingTop: insets.top + 18 }]}>
        <Text style={styles.wordmark}>Fork</Text>
        {home && <Text style={styles.date}>{dateLabel(home.episode.date)}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={14} onPress={onSettings} style={styles.settings}>
          <SettingsGlyph />
        </Pressable>
      </View>

      {home && (
        <Animated.View
          style={[
            styles.bottom,
            {
              paddingBottom: insets.bottom + 22,
              opacity: appear,
              transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
            },
          ]}
        >
          <Text style={styles.kicker}>Today{"\u2019"}s episode</Text>
          <Text style={styles.title}>{home.episode.title}</Text>
          <Text style={styles.tagline}>{home.episode.tagline}</Text>

          <View style={styles.streak}>
            <Text style={styles.streakNumber}>{home.streak}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
            <View style={styles.pips}>
              {Array.from({ length: 7 }, (_, i) => (
                <View key={i} style={[styles.pip, i < ((home.streak - 1) % 7) + 1 && home.streak > 0 && styles.pipOn]} />
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            disabled={starting}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onPlay();
            }}
            style={({ pressed }) => [styles.play, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}
          >
            {starting ? (
              <Ring size={22} color={colors.bg} />
            ) : (
              <>
                <View style={styles.triangle} />
                <Text style={styles.playText}>{action}</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: "hidden" },
  top: { position: "absolute", top: 0, left: 26, right: 26, flexDirection: "row", alignItems: "center" },
  wordmark: { flex: 1, fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.5, color: colors.text },
  settings: { marginLeft: 16, opacity: 0.8 },
  date: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.dim },
  bottom: { position: "absolute", left: 26, right: 26, bottom: 0 },
  kicker: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 12, letterSpacing: 2.6, textTransform: "uppercase", color: colors.dim, marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 52, lineHeight: 56, color: colors.text },
  tagline: { fontFamily: fonts.ui, fontWeight: "400", fontSize: 18, lineHeight: 26, color: colors.dim, marginTop: 14 },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  streakNumber: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text },
  streakLabel: { fontFamily: fonts.ui, fontWeight: "500", fontSize: 15, color: colors.dim, marginLeft: 10, flex: 1 },
  pips: { flexDirection: "row", gap: 6 },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(244,241,234,0.22)" },
  pipOn: { backgroundColor: colors.text },
  play: {
    height: 62,
    borderRadius: 31,
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.text,
  },
  triangle: {
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 13,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.bg,
  },
  playText: { fontFamily: fonts.ui, fontWeight: "600", fontSize: 18, letterSpacing: 0.2, color: colors.bg },
});
