import * as Haptics from "expo-haptics";
import { useVideoPlayer, VideoView } from "expo-video";
import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReduceMotion } from "../a11y";
import { useStory, videoSource, type ChoiceOption, type DreamView } from "../data";
import { colors, ease, fonts, motion, radius, type } from "../theme";
import { AsciiDissolve } from "./AsciiDissolve";
import { ChoiceOverlay } from "./ChoiceOverlay";
import { Glass } from "./Glass";

const STATUS: Record<DreamView["status"], string> = {
  writing: "writing the shot",
  generating: "generating",
  ready: "ready",
  failed: "the dream slipped away",
};
const FRAME_ASPECT = 768 / 1344;

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

function Waiting({ status, prompt, startedAt }: { status: DreamView["status"]; prompt?: string; startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={StyleSheet.absoluteFill}>
      <AsciiDissolve show />
      <View style={styles.status}>
        <Text style={styles.statusLine}>{STATUS[status]}</Text>
        <Text style={styles.timer}>{((now - startedAt) / 1000).toFixed(1)}s</Text>
        {prompt ? <Text numberOfLines={2} style={styles.statusPrompt}>{"\u201C" + prompt + "\u201D"}</Text> : null}
      </View>
    </View>
  );
}

function Scene({ dreamId, startedAt, onFail, onContinue }: { dreamId: string; startedAt: number; onFail: (error: string) => void; onContinue: (next: string) => void }) {
  const story = useStory();
  const view = story.useDream?.(dreamId);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const holdScale = useRef(new Animated.Value(1)).current;
  const [ended, setEnded] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });
  const clipUrl = view?.status === "ready" ? view.clipUrl ?? null : null;

  useEffect(() => {
    if (view?.status === "failed") onFail(view.error || "The dream could not be made. Try another prompt.");
  }, [view?.status, view?.error, onFail]);

  useEffect(() => {
    if (!clipUrl) return;
    setEnded(false);
    player.replaceAsync(videoSource(clipUrl)).then(() => player.play()).catch(() => {});
    const subs = [
      player.addListener("playToEnd", () => setEnded(true)),
      player.addListener("timeUpdate", ({ currentTime }) => {
        if (player.duration > 0 && currentTime >= player.duration - 0.2) setEnded(true);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [clipUrl, player]);

  if (!clipUrl) return <Waiting status={view?.status ?? "writing"} prompt={view?.prompt} startedAt={startedAt} />;

  const scale = Math.max(width / FRAME_ASPECT, height);
  const video = { x: (width - FRAME_ASPECT * scale) / 2, y: (height - scale) / 2, w: FRAME_ASPECT * scale, h: scale };
  const options: ChoiceOption[] | null =
    ended && view?.stopStatus === "ready" && view.stop?.options.length
      ? view.stop.options.map((o) => ({ id: o.id, label: o.label, region: o.region, actions: [{ id: "go", label: o.label, childStatus: "ready", childClipUrl: null }] }))
      : null;

  const pick = async (optionId: string) => {
    if (picked || !story.dreamContinue) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPicked(optionId);
    try {
      onContinue(await story.dreamContinue(dreamId, optionId));
    } catch {
      setPicked(null);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      {view?.caption ? (
        <View pointerEvents="none" style={[styles.caption, { top: insets.top + 64 }]}>
          <Text numberOfLines={2} style={styles.captionText}>{view.caption}</Text>
        </View>
      ) : null}
      {ended && view?.stopStatus === "analysing" ? (
        <View pointerEvents="none" style={[styles.reading, { bottom: insets.bottom + 92 }]}>
          <Text style={styles.readingText}>reading the scene{"\u2026"}</Text>
        </View>
      ) : null}
      {options ? (
        <ChoiceOverlay
          key={dreamId}
          options={options}
          video={video}
          holdScale={holdScale}
          picked={picked}
          onPick={(id) => pick(id)}
          bottomInset={insets.bottom + 76}
          screenWidth={width}
          safe={{ top: insets.top + 82, bottom: height - insets.bottom - 96 }}
        />
      ) : null}
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
  const [step, setStep] = useState(1);
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
      setStep(1);
    } catch {
      setError("Dreaming is not open yet. Try again in a moment.");
    }
    setStarting(false);
  };

  const fail = (message: string) => {
    setDreamId(null);
    setError(message);
  };

  const next = (id: string) => {
    setStartedAt(Date.now());
    setStep((n) => n + 1);
    setDreamId(id);
  };

  const fresh = () => {
    setDreamId(null);
    setError(null);
    setPrompt("");
    setStep(1);
  };

  if (dreamId || starting) {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.black }]}>
        {dreamId ? (
          <Guard key={dreamId} onError={() => fail("Dreaming is not open yet. Try again in a moment.")}>
            <Scene key={dreamId} dreamId={dreamId} startedAt={startedAt} onFail={fail} onContinue={next} />
          </Guard>
        ) : (
          <Waiting status="writing" startedAt={startedAt} />
        )}
        <View style={[styles.chrome, { top: insets.top + 8 }]}>
          <Glass interactive style={styles.round}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.hit}>
              <Text style={styles.glyph}>{"\u00D7"}</Text>
            </Pressable>
          </Glass>
          <Text style={styles.step}>STEP {step}</Text>
          <View style={styles.round} />
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
          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>One shot, generated live. Tap what you see to keep going.</Text>}
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
  caption: { position: "absolute", left: 24, right: 24, alignItems: "center" },
  captionText: { fontFamily: fonts.ui, fontSize: type.small, lineHeight: 20, color: colors.text, textAlign: "center", textShadowColor: colors.textShadow, textShadowRadius: 6 },
  reading: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  readingText: { fontFamily: fonts.mono, fontSize: type.small, letterSpacing: 1, color: colors.text, textShadowColor: colors.textShadow, textShadowRadius: 6 },
  chrome: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  step: { fontFamily: fonts.mono, fontSize: type.micro, letterSpacing: type.labelTracking, color: colors.text, textShadowColor: colors.textShadow, textShadowRadius: 6 },
  round: { width: 44, height: 44, borderRadius: radius.round },
  hit: { flex: 1, alignItems: "center", justifyContent: "center" },
  glyph: { fontFamily: fonts.ui, fontSize: 24, color: colors.text, marginTop: -2 },
  bottomBar: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: { borderRadius: radius.round },
  pillHit: { minHeight: 48, paddingHorizontal: 26, alignItems: "center", justifyContent: "center" },
  pillText: { fontFamily: fonts.uiMedium, fontSize: type.control, letterSpacing: 1, color: colors.text },
});
