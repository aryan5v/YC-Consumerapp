import * as Haptics from "expo-haptics";
import { useVideoPlayer, VideoView } from "expo-video";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "../a11y";
import { useStory, videoSource, type DreamView } from "../data";
import { colors, ease, fonts, motion, radius, type } from "../theme";
import { AsciiDissolve } from "./AsciiDissolve";
import { Glass } from "./Glass";

const STATUS: Record<DreamView["status"], string> = {
  writing: "writing the shot",
  generating: "generating",
  ready: "ready",
  failed: "the dream slipped away",
};

class Guard extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Clip({ url }: { url: string }) {
  const player = useVideoPlayer(videoSource(url), (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function Watch({ dreamId, startedAt, onFail }: { dreamId: string; startedAt: number; onFail: (error: string) => void }) {
  const story = useStory();
  const view = story.useDream?.(dreamId);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (view?.status === "failed") onFail(view.error || "The dream could not be made. Try another prompt.");
  }, [view?.status, view?.error, onFail]);
  if (view?.status === "ready" && view.clipUrl) return <Clip url={view.clipUrl} />;
  const seconds = ((now - startedAt) / 1000).toFixed(1);
  return (
    <View style={StyleSheet.absoluteFill}>
      <AsciiDissolve show />
      <View style={styles.status}>
        <Text style={styles.statusLine}>{STATUS[view?.status ?? "writing"]}</Text>
        <Text style={styles.timer}>{seconds}s</Text>
        {view?.prompt ? <Text numberOfLines={2} style={styles.statusPrompt}>{"\u201C" + view.prompt + "\u201D"}</Text> : null}
      </View>
    </View>
  );
}

export function Dream({ onClose }: { onClose: () => void }) {
  const story = useStory();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const rise = useRef(new Animated.Value(0)).current;
  const [prompt, setPrompt] = useState("");
  const [dreamId, setDreamId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: reduce ? motion.instant : motion.sheet, easing: ease.out, useNativeDriver: true }).start();
  }, [rise, reduce]);

  const start = async () => {
    const text = prompt.trim();
    if (!text || starting) return;
    if (!story.dreamStart) {
      setError("Dreams need the live story. Turn off Demo story in Settings.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setStarting(true);
    setError(null);
    setStartedAt(Date.now());
    try {
      setDreamId(await story.dreamStart(text));
    } catch {
      setError("Dreaming is not open yet. Try again in a moment.");
    }
    setStarting(false);
  };

  const fail = (message: string) => {
    setDreamId(null);
    setError(message);
  };

  const fresh = () => {
    setDreamId(null);
    setError(null);
    setPrompt("");
  };

  if (dreamId || starting) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.black }]}>
        {dreamId ? (
          <Guard onError={() => fail("Dreaming is not open yet. Try again in a moment.")}>
            <Watch dreamId={dreamId} startedAt={startedAt} onFail={fail} />
          </Guard>
        ) : (
          <View style={StyleSheet.absoluteFill}>
            <AsciiDissolve show />
            <View style={styles.status}>
              <Text style={styles.statusLine}>{STATUS.writing}</Text>
            </View>
          </View>
        )}
        <View style={[styles.chrome, { top: insets.top + 8 }]}>
          <Glass interactive style={styles.round}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.hit}>
              <Text style={styles.glyph}>{"\u00D7"}</Text>
            </Pressable>
          </Glass>
        </View>
        <View style={[styles.bottomBar, { bottom: insets.bottom + 18 }]}>
          <Glass interactive style={styles.pill}>
            <Pressable accessibilityRole="button" accessibilityLabel="New prompt" onPress={fresh} style={styles.pillHit}>
              <Text style={styles.pillText}>new prompt</Text>
            </Pressable>
          </Glass>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[StyleSheet.absoluteFill, styles.scrim]}>
      <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}>
        <Glass style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.grabber} />
          <Text style={styles.kicker}>DREAM A WORLD</Text>
          <Text style={styles.title}>Describe a place.{"\n"}Synqui films it.</Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="A lantern market on a rainy pier at dusk"
            placeholderTextColor={colors.faint}
            keyboardAppearance="dark"
            selectionColor={colors.text}
            multiline
            maxLength={240}
            autoFocus
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>One shot, generated live. It takes about a minute.</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dream it"
            disabled={!prompt.trim()}
            onPress={start}
            style={({ pressed }) => [styles.primary, !prompt.trim() && { opacity: 0.4 }, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.primaryText}>Dream it</Text>
          </Pressable>
        </Glass>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: 24, paddingTop: 10, gap: 14 },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: colors.inactive, marginBottom: 6 },
  kicker: { fontFamily: fonts.mono, fontSize: type.micro, letterSpacing: type.labelTracking, color: colors.dim },
  title: { fontFamily: fonts.display, fontSize: type.question, lineHeight: 30, color: colors.text },
  input: { minHeight: 96, borderRadius: radius.card, padding: 16, paddingTop: 14, color: colors.text, fontFamily: fonts.ui, fontSize: type.control, lineHeight: 22, backgroundColor: colors.wash, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, textAlignVertical: "top" },
  hint: { fontFamily: fonts.mono, fontSize: type.small, color: colors.dim },
  error: { fontFamily: fonts.mono, fontSize: type.small, color: colors.text },
  primary: { minHeight: 54, borderRadius: radius.button, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.uiSemibold, fontSize: type.control, color: colors.accentInk },
  status: { position: "absolute", left: 28, right: 28, top: "38%", alignItems: "center", gap: 10 },
  statusLine: { fontFamily: fonts.mono, fontSize: type.small, letterSpacing: type.labelTracking, textTransform: "uppercase", color: colors.text },
  timer: { fontFamily: fonts.display, fontSize: type.endStat, color: colors.text },
  statusPrompt: { fontFamily: fonts.ui, fontSize: type.small, lineHeight: 20, color: colors.dim, textAlign: "center" },
  chrome: { position: "absolute", left: 16 },
  round: { width: 44, height: 44, borderRadius: radius.round },
  hit: { flex: 1, alignItems: "center", justifyContent: "center" },
  glyph: { fontFamily: fonts.ui, fontSize: 24, color: colors.text, marginTop: -2 },
  bottomBar: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: { borderRadius: radius.round },
  pillHit: { minHeight: 48, paddingHorizontal: 26, alignItems: "center", justifyContent: "center" },
  pillText: { fontFamily: fonts.uiMedium, fontSize: type.control, letterSpacing: 1, color: colors.text },
});
