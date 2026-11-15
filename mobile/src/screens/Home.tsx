import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "../a11y";
import { Glass } from "../components/Glass";
import { Ring } from "../components/Ring";
import { SettingsGlyph } from "../components/SettingsSheet";
import { useStory } from "../data";
import { AsciiDivider } from "../components/AsciiDivider";
import { AsciiScene } from "../components/AsciiScene";
import { ascii, colors, ease, fonts, gradients, motion, radius, type } from "../theme";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function Home({ starting, onPlay, onWander, onSettings }: { starting: boolean; onPlay: () => void; onWander?: () => void; onSettings: () => void }) {
  const story = useStory();
  const reduceMotion = useReduceMotion();
  const home = story.useHome();
  const insets = useSafeAreaInsets();
  const appear = useRef(new Animated.Value(0)).current;
  const loaded = home !== undefined;

  useEffect(() => {
    if (loaded) Animated.timing(appear, { toValue: 1, duration: motion.slower, delay: 150, easing: ease.out, useNativeDriver: true }).start();
  }, [loaded, appear]);

  const action = !home?.run ? "Play" : home.run.status === "active" ? "Continue" : story.canReplay ? "Play again" : "See your ending";

  return (
    <View style={styles.root}>
      {home && (
        <View style={[StyleSheet.absoluteFill, { top: insets.top + ascii.top }]}>
          <AsciiScene />
        </View>
      )}
      <LinearGradient
        colors={gradients.home.colors}
        locations={gradients.home.locations}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.top, { paddingTop: insets.top + 18 }]}>
        <View style={styles.brand}>
          <Image source={require("../../assets/brand/synqui-mark.png")} style={styles.mark} accessibilityIgnoresInvertColors />
          <Text style={styles.wordmark}>Synqui</Text>
        </View>
        {home && <Text style={styles.date}>{dateLabel(home.episode.date)}</Text>}
        <Glass interactive style={styles.settings}>
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} style={styles.settingsHit}>
            <SettingsGlyph />
          </Pressable>
        </Glass>
      </View>

      {home && (
        <Animated.View
          style={[
            styles.bottom,
            {
              paddingBottom: insets.bottom + 22,
              opacity: appear,
              transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 18, 0] }) }],
            },
          ]}
        >
          <Text style={styles.kicker}>Today{"\u2019"}s episode</Text>
          <Text style={styles.title}>{home.episode.title}</Text>
          <Text style={styles.tagline}>{home.episode.tagline}</Text>

          <View style={styles.divider}>
            <AsciiDivider />
          </View>

          <View style={styles.streak}>
            <Text style={styles.streakNumber}>{home.streak}</Text>
            <Text style={styles.streakLabel}>day streak</Text>
            <View style={styles.pips}>
              {Array.from({ length: 7 }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.pip,
                    i < ((home.streak - 1) % 7) + 1 && home.streak > 0 && styles.pipOn,
                    i === (home.streak - 1) % 7 && home.streak > 0 && styles.pipToday,
                  ]}
                />
              ))}
            </View>
          </View>

          <Glass tinted interactive style={styles.playGlass}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            disabled={starting}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPlay();
            }}
            style={({ pressed }) => [styles.play, pressed && { opacity: 0.85 }]}
          >
            {starting ? (
              <Ring size={22} />
            ) : (
              <>
                <View style={styles.triangle} />
                <Text maxFontSizeMultiplier={1.4} style={styles.playText}>{action}</Text>
              </>
            )}
          </Pressable>
          </Glass>
          {onWander && (
            <Glass interactive style={styles.wanderGlass}>
              <Pressable accessibilityRole="button" accessibilityLabel="Wander" disabled={starting} onPress={onWander} style={styles.wander}>
                <Text maxFontSizeMultiplier={1.4} style={styles.wanderText}>Wander</Text>
              </Pressable>
            </Glass>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: "hidden" },
  top: { position: "absolute", top: 0, left: 26, right: 26, flexDirection: "row", alignItems: "center" },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 24, height: 24 },
  wordmark: { fontFamily: fonts.title, fontSize: type.wordmark, letterSpacing: 3, color: colors.text },
  settings: { width: 44, height: 44, marginLeft: 16, borderRadius: radius.round },
  settingsHit: { flex: 1, alignItems: "center", justifyContent: "center" },
  date: { fontFamily: fonts.mono, fontSize: type.micro, letterSpacing: ascii.monoTracking, textTransform: "uppercase", color: colors.dim },
  bottom: { position: "absolute", left: 26, right: 26, bottom: 0 },
  kicker: { fontFamily: fonts.mono, fontSize: type.micro, letterSpacing: ascii.monoTracking, textTransform: "uppercase", color: colors.dim, marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: type.hero, lineHeight: type.hero * 1.02, color: colors.text },
  tagline: { fontFamily: fonts.ui, fontSize: type.lead, lineHeight: 26, color: colors.dim, marginTop: 14 },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  divider: { marginTop: 24 },
  streakNumber: { fontFamily: fonts.monoMedium, fontSize: type.stat, lineHeight: 36, color: colors.text },
  streakLabel: { fontFamily: fonts.mono, fontSize: type.small, color: colors.dim, marginLeft: 10, flex: 1 },
  pips: { flexDirection: "row", gap: 6 },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.inactive },
  pipOn: { backgroundColor: colors.text },
  pipToday: { backgroundColor: colors.accent },
  playGlass: { borderRadius: radius.button, marginTop: 24 },
  wanderGlass: { borderRadius: radius.button, marginTop: 12 },
  wander: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  wanderText: { fontFamily: fonts.uiMedium, fontSize: type.control, letterSpacing: 1, color: colors.text },
  play: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  triangle: {
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 13,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.text,
  },
  playText: { fontFamily: fonts.uiSemibold, fontSize: type.lead, letterSpacing: 0.2, color: colors.text },
});
