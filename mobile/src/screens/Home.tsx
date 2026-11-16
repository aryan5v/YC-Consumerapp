import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  const [sheet, setSheet] = useState<null | "dream" | "past" | "profile">(null);

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
          <Glass tinted interactive style={styles.caseCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={"Today's case, " + action}
              disabled={starting}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPlay();
              }}
              style={({ pressed }) => [styles.caseHit, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.kicker}>Today{"’"}s case · Case 1</Text>
              <Text style={styles.title}>{home.episode.title}</Text>
              <Text style={styles.tagline}>{home.episode.tagline}</Text>
              <View style={styles.caseFoot}>
                {starting ? <Ring size={20} /> : <Text style={styles.caseAction}>{action} {"→"}</Text>}
                <Text style={styles.caseMeta}>{home.run ? (home.run.status === "active" ? "In progress" : "Played today") : "5 moves · one answer"}</Text>
              </View>
            </Pressable>
          </Glass>

          <View style={styles.pair}>
            {onWander && (
              <Glass interactive style={styles.modeCard}>
                <Pressable accessibilityRole="button" accessibilityLabel="Wander" disabled={starting} onPress={onWander} style={styles.modeHit}>
                  <Text style={styles.motif}>{".  ~ ~ .  ~\n ~ .  ~  . ~"}</Text>
                  <Text style={styles.modeTitle}>Wander</Text>
                  <Text style={styles.modeSub}>The open world</Text>
                </Pressable>
              </Glass>
            )}
            <Glass interactive style={styles.modeCard}>
              <Pressable accessibilityRole="button" accessibilityLabel="Dream a world" onPress={() => setSheet("dream")} style={styles.modeHit}>
                <Text style={styles.motif}>{"* .  o  . *\n .  *  .  o ."}</Text>
                <Text style={styles.modeTitle}>Dream a world</Text>
                <Text style={styles.modeSub}>Describe it</Text>
              </Pressable>
            </Glass>
          </View>

          <View style={styles.rows}>
            <Glass interactive style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel="Past cases" onPress={() => setSheet("past")} style={styles.rowHit}>
                <Text style={styles.rowText}>Past cases</Text>
                <Text style={styles.rowChevron}>{"›"}</Text>
              </Pressable>
            </Glass>
            <Glass interactive style={styles.row}>
              <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => setSheet("profile")} style={styles.rowHit}>
                <Text style={styles.rowText}>Profile</Text>
                <Text style={styles.rowChevron}>{"›"}</Text>
              </Pressable>
            </Glass>
          </View>
        </Animated.View>
      )}
      {sheet === "dream" && (
        <View style={[StyleSheet.absoluteFill, styles.scrim]}>
          <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} />
          <Glass style={[styles.dream, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.kicker}>Dream a world</Text>
            <TextInput placeholder="A harbour town that never sleeps" placeholderTextColor={colors.faint} keyboardAppearance="dark" selectionColor={colors.text} style={styles.dreamInput} />
            <Text style={styles.modeSub}>Coming soon. Worlds you describe will open here.</Text>
            <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={styles.dreamDone}><Text style={styles.rowText}>Done</Text></Pressable>
          </Glass>
        </View>
      )}
      {(sheet === "past" || sheet === "profile") && home && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, paddingTop: insets.top + 18, paddingHorizontal: 26 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setSheet(null)} style={styles.back}><Text style={styles.rowText}>{"‹"} Back</Text></Pressable>
          {sheet === "past" ? (
            <>
              <Text style={styles.title}>Past cases</Text>
              <Glass style={styles.pastRow}><Text style={styles.modeTitle}>Case 1 · {home.episode.title}</Text><Text style={styles.modeSub}>{home.run ? (home.run.status === "active" ? "In progress" : "Played") : "Not played yet"}</Text></Glass>
              {["Case 2 · The lamp that lied", "Case 3 · Low tide at Pier Four", "Case 4 · The last ferry"].map((t) => (
                <Glass key={t} style={[styles.pastRow, { opacity: 0.55 }]}><Text style={styles.modeTitle}>{t}</Text><Text style={styles.modeSub}>Locked · opens in a later season</Text></Glass>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.title}>Profile</Text>
              <Glass style={styles.pastRow}><Text style={styles.modeTitle}>This device</Text><Text style={styles.modeSub}>Your name is set by this phone. No sign-in.</Text></Glass>
              <Glass style={styles.pastRow}><Text style={styles.modeTitle}>{home.streak} day streak</Text><Text style={styles.modeSub}>Come back tomorrow to keep it</Text></Glass>
              <Glass interactive style={styles.pastRow}><Pressable accessibilityRole="button" onPress={onSettings}><Text style={styles.modeTitle}>Sound, voice and captions</Text><Text style={styles.modeSub}>Open settings</Text></Pressable></Glass>
              <Glass style={[styles.pastRow, { opacity: 0.8 }]}><Text style={styles.modeTitle}>Synqui Plus</Text><Text style={styles.modeSub}>More cases, more worlds. Coming soon.</Text></Glass>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caseCard: { borderRadius: radius.button },
  caseHit: { padding: 20 },
  caseFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  caseAction: { fontFamily: fonts.uiSemibold, fontSize: type.lead, color: colors.text },
  caseMeta: { fontFamily: fonts.mono, fontSize: type.micro, letterSpacing: ascii.monoTracking, textTransform: "uppercase", color: colors.dim },
  pair: { flexDirection: "row", gap: 12, marginTop: 12 },
  modeCard: { flex: 1, borderRadius: radius.button },
  modeHit: { padding: 16, minHeight: 112 },
  motif: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 13, color: colors.dim, marginBottom: 10 },
  modeTitle: { fontFamily: fonts.uiSemibold, fontSize: type.control, color: colors.text },
  modeSub: { fontFamily: fonts.mono, fontSize: type.small, color: colors.dim, marginTop: 4 },
  rows: { marginTop: 12, gap: 8 },
  row: { borderRadius: radius.button },
  rowHit: { minHeight: 48, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowText: { fontFamily: fonts.uiMedium, fontSize: type.control, color: colors.text },
  rowChevron: { fontFamily: fonts.ui, fontSize: 22, color: colors.dim },
  scrim: { backgroundColor: "rgba(7,26,33,0.5)", justifyContent: "flex-end" },
  dream: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, gap: 14 },
  dreamInput: { minHeight: 48, borderRadius: radius.button, paddingHorizontal: 16, color: colors.text, fontFamily: fonts.mono, fontSize: type.control, backgroundColor: "rgba(232,238,241,0.08)" },
  dreamDone: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  back: { minHeight: 44, justifyContent: "center", marginBottom: 12 },
  pastRow: { borderRadius: radius.button, padding: 18, marginTop: 12 },
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
  pipToday: { backgroundColor: colors.text },
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
