import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoThumbnail } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BeatDots } from "../components/BeatDots";
import { Captions } from "../components/Captions";
import { ChoiceOverlay, chipsHeight } from "../components/ChoiceOverlay";
import { EndingCard } from "../components/EndingCard";
import { MicButton } from "../components/MicButton";
import { Presence } from "../components/Presence";
import { PuzzleSheet, type PuzzleState } from "../components/PuzzleSheet";
import { SettingsGlyph, SettingsSheet } from "../components/SettingsSheet";
import { audioSource, useStory, videoSource, type Ending, type Stop } from "../data";
import { useReduceMotion } from "../a11y";
import { useSettings } from "../settings";
import { colors, ease, fonts, gradients, letterbox, motion, radius, type } from "../theme";

const SLOTS = [0, 1, 2, 3];
const PORTRAIT = 9 / 16;
const PUZZLE_FEEDBACK_MS = 900;
const HEARD_MS = 550;
const DUCKED_VOLUME = 0.25;
const TARGET_TOP_CLEARANCE = 44;
const CAPTION_CLEARANCE = 96;
const MIC_SPACE = 58;

let speakUnavailable = false;

type Slot = { url: string | null; ready: boolean; aspect: number | null; retries: number; backdrop: VideoThumbnail | null };
type Snap = { beatId: string; clipUrl: string; narration: string; stop: Stop | null; ending: Ending | null; beatIndex: number; beatsTotal: number };
type Commit = { fromBeatId: string; optionId?: string; url: string | null };

function setup(player: VideoPlayer) {
  player.loop = false;
  player.muted = true;
}

export function Player({
  runId,
  streak,
  episodeTitle,
  onStarted,
  onExit,
}: {
  runId: string;
  streak: number;
  episodeTitle: string;
  onStarted: () => void;
  onExit: () => void;
}) {
  const story = useStory();
  const view = story.useRun(runId);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const p0 = useVideoPlayer(null, setup);
  const p1 = useVideoPlayer(null, setup);
  const p2 = useVideoPlayer(null, setup);
  const p3 = useVideoPlayer(null, setup);
  const players = useMemo(() => [p0, p1, p2, p3], [p0, p1, p2, p3]);

  const slots = useRef<Slot[]>(SLOTS.map(() => ({ url: null, ready: false, aspect: null, retries: 0, backdrop: null }))).current;
  const activeRef = useRef(-1);
  const previousRef = useRef(-1);
  const notBefore = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const [active, setActive] = useState(-1);
  const [previous, setPrevious] = useState(-1);
  const [phase, setPhase] = useState<"loading" | "playing" | "held">("loading");
  const [commit, setCommit] = useState<Commit | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [puzzleState, setPuzzleState] = useState<PuzzleState>("idle");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [chrome, setChrome] = useState(false);
  const holdScale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const line = useRef<{ url: string; player: AudioPlayer } | null>(null);
  const replyAudio = useRef<AudioPlayer | null>(null);

  const displayedUrl = active >= 0 ? slots[active].url : null;
  const stale = !!view && !!commit && view.current.beatId === commit.fromBeatId;

  const load = useCallback(
    (i: number) => {
      const url = slots[i].url;
      if (!url) return;
      players[i].muted = true;
      players[i].replaceAsync(videoSource(url)).catch(() => {});
    },
    [players, slots],
  );

  useEffect(() => {
    const subs = players.flatMap((player, i) => [
      player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay" && !slots[i].ready) {
          slots[i].ready = true;
          bump();
        }
        if (status === "error" && slots[i].url && slots[i].retries < 4) {
          slots[i].retries += 1;
          setTimeout(() => load(i), 800 * slots[i].retries);
        }
      }),
      player.addListener("sourceLoad", ({ availableVideoTracks, duration }) => {
        const size = availableVideoTracks[0]?.size;
        if (size && size.width > 0 && size.height > 0) {
          slots[i].aspect = size.width / size.height;
          bump();
          if (slots[i].aspect >= 1) {
            const url = slots[i].url;
            player
              .generateThumbnailsAsync(duration > 0 ? duration / 2 : 1, { maxWidth: letterbox.thumbWidth })
              .then(([thumb]) => {
                if (thumb && slots[i].url === url) {
                  slots[i].backdrop = thumb;
                  bump();
                }
              })
              .catch(() => {});
          }
        }
      }),
      player.addListener("playToEnd", () => {
        if (activeRef.current === i) setPhase("held");
      }),
    ]);
    return () => subs.forEach((s) => s.remove());
  }, [players, slots, bump, load]);

  useEffect(() => {
    if (!view) return;
    const wanted: string[] = [];
    if (view.current.status === "ready" && view.current.clipUrl) wanted.push(view.current.clipUrl);
    if (commit?.url) wanted.push(commit.url);
    if (view.stop?.kind === "choice") {
      for (const o of view.stop.options) if (o.childStatus === "ready" && o.childClipUrl) wanted.push(o.childClipUrl);
    }
    if (view.stop?.kind === "puzzle") {
      for (const o of [view.stop.outcomes.success, view.stop.outcomes.failure]) if (o.status === "ready" && o.clipUrl) wanted.push(o.clipUrl);
    }
    for (const url of wanted) {
      if (slots.some((s) => s.url === url)) continue;
      const i = slots.findIndex(
        (s, index) => index !== activeRef.current && index !== previousRef.current && (s.url === null || !wanted.includes(s.url)),
      );
      if (i < 0) continue;
      slots[i] = { url, ready: false, aspect: null, retries: 0, backdrop: null };
      load(i);
    }
  }, [view, commit, slots, load]);

  const activate = useCallback(
    (i: number) => {
      const prev = activeRef.current;
      players[i].volume = 1;
      players[i].muted = false;
      players[i].play();
      activeRef.current = i;
      notBefore.current = 0;
      setActive(i);
      setPhase("playing");
      setPicked(null);
      setPuzzleState("idle");
      setHeard(null);
      setReply(null);
      if (prev < 0) return onStarted();
      players[prev].muted = true;
      previousRef.current = prev;
      setPrevious(prev);
      setTimeout(() => {
        players[prev].pause();
        if (previousRef.current === prev) {
          previousRef.current = -1;
          setPrevious(-1);
        }
      }, 280);
    },
    [players, onStarted],
  );

  useEffect(() => {
    if (!view) return;
    if (commit && !stale && commit.fromBeatId !== view.current.beatId) setCommit(null);

    let target: string | null = null;
    if (stale && commit) {
      target = commit.url;
      if (!target && commit.optionId && view.stop?.kind === "choice") {
        const option = view.stop.options.find((o) => o.id === commit.optionId);
        if (option?.childStatus === "ready") target = option.childClipUrl;
      }
    } else if (view.current.status === "ready") {
      target = view.current.clipUrl;
    }
    if (!target || target === displayedUrl) return;
    const i = slots.findIndex((s) => s.url === target && s.ready);
    if (i < 0) return;
    const wait = notBefore.current - Date.now();
    if (wait > 0) {
      if (!Number.isFinite(wait)) return;
      const timer = setTimeout(bump, wait);
      return () => clearTimeout(timer);
    }
    activate(i);
  });

  useEffect(() => {
    if (!view || !displayedUrl || view.current.clipUrl !== displayedUrl) return;
    setSnap({
      beatId: view.current.beatId,
      clipUrl: displayedUrl,
      narration: view.current.narration,
      stop: view.stop,
      ending: view.ending,
      beatIndex: view.beatIndex,
      beatsTotal: view.beatsTotal,
    });
  }, [view, displayedUrl]);

  useEffect(() => {
    holdScale.setValue(1);
    if (phase !== "held" || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(holdScale, { toValue: motion.holdScale, duration: motion.hold, easing: ease.inOut, useNativeDriver: true }),
        Animated.timing(holdScale, { toValue: 1, duration: motion.hold, easing: ease.inOut, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, holdScale, reduceMotion]);

  useEffect(() => {
    if (!chrome) return;
    const timer = setTimeout(() => setChrome(false), 2800);
    return () => clearTimeout(timer);
  }, [chrome]);

  const current = snap && snap.clipUrl === displayedUrl ? snap : null;
  const held = phase === "held" && current !== null;
  const choice = held && current.stop?.kind === "choice" ? current.stop : null;
  const puzzle = held && current.stop?.kind === "puzzle" ? current.stop : null;
  const ending = held && current.stop === null ? current.ending : null;

  const lineUrl = view?.stop?.spokenAudioUrl ?? null;
  useEffect(() => {
    if (line.current?.url === lineUrl) return;
    line.current?.player.remove();
    line.current = lineUrl ? { url: lineUrl, player: createAudioPlayer(audioSource(lineUrl)) } : null;
  }, [lineUrl]);

  useEffect(
    () => () => {
      line.current?.player.remove();
      replyAudio.current?.remove();
    },
    [],
  );

  const heldLineUrl = held && settings.voice ? (current.stop?.spokenAudioUrl ?? null) : null;
  useEffect(() => {
    const audio = line.current;
    if (!heldLineUrl || audio?.url !== heldLineUrl) return;
    const clip = players[activeRef.current];
    const restore = () => {
      if (clip) clip.volume = 1;
    };
    const finished = audio.player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) restore();
    });
    const timer = setTimeout(() => {
      if (clip) clip.volume = DUCKED_VOLUME;
      audio.player.seekTo(0).catch(() => {});
      audio.player.play();
    }, 350);
    return () => {
      clearTimeout(timer);
      finished.remove();
      restore();
      if (line.current === audio) audio.player.pause();
    };
  }, [heldLineUrl, players]);

  const settlePuzzle = (beatId: string, correct: boolean) => {
    Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    setPuzzleState(correct ? "correct" : "wrong");
    notBefore.current = Date.now() + PUZZLE_FEEDBACK_MS;
    const live = viewRef.current;
    if (live?.current.beatId === beatId && live.stop?.kind === "puzzle") {
      const outcome = correct ? live.stop.outcomes.success : live.stop.outcomes.failure;
      if (outcome.status === "ready" && outcome.clipUrl) setCommit({ fromBeatId: beatId, url: outcome.clipUrl });
    }
    bump();
  };

  const say = async (recordingUri: string) => {
    if (!current?.stop || !story.speak || picked || puzzleState !== "idle") return;
    const stop = current.stop;
    setVoiceBusy(true);
    setReply(null);
    setCommit({ fromBeatId: current.beatId, url: null });
    notBefore.current = Infinity;
    try {
      const result = await story.speak(runId, recordingUri, current.beatId);
      setHeard(result.transcript);
      if (stop.kind === "choice" && result.matchedOptionId) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setPicked(result.matchedOptionId);
        notBefore.current = Date.now() + HEARD_MS;
        bump();
      } else if (stop.kind === "puzzle" && result.correct !== null) {
        settlePuzzle(current.beatId, result.correct);
      } else {
        notBefore.current = 0;
        setCommit(null);
        setReply(result.reply ?? "Say that again?");
        setTimeout(() => setHeard(null), 1100);
        if (result.replyAudioUrl && settings.voice) {
          replyAudio.current?.remove();
          replyAudio.current = createAudioPlayer(audioSource(result.replyAudioUrl));
          replyAudio.current.play();
        }
      }
    } catch {
      speakUnavailable = true;
      notBefore.current = 0;
      setCommit(null);
    } finally {
      setVoiceBusy(false);
    }
  };

  const micOn = settings.microphone && !!story.speak && !!current?.stop?.spokenAudioUrl && !speakUnavailable && !micDenied;
  const mic = (
    <MicButton
      busy={voiceBusy}
      disabled={picked !== null || puzzleState !== "idle"}
      onListening={(on) => {
        setListening(on);
        if (!on) return;
        line.current?.player.pause();
        replyAudio.current?.pause();
        setHeard(null);
        setReply(null);
      }}
      onRecording={say}
      onDenied={() => setMicDenied(true)}
    />
  );

  const pick = (optionId: string) => {
    const live = viewRef.current;
    if (!current || picked || voiceBusy || live?.stop?.kind !== "choice") return;
    const option = live.stop.options.find((o) => o.id === optionId);
    if (!option) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPicked(optionId);
    setCommit({ fromBeatId: current.beatId, optionId, url: option.childStatus === "ready" ? option.childClipUrl : null });
    story.choose(runId, optionId, current.beatId).catch(() => {
      setPicked(null);
      setCommit(null);
    });
  };

  const submit = async (answer: string) => {
    if (!current || puzzleState !== "idle" || voiceBusy) return;
    setPuzzleState("submitting");
    setCommit({ fromBeatId: current.beatId, url: null });
    notBefore.current = Infinity;
    try {
      const { correct } = await story.answer(runId, answer, current.beatId);
      settlePuzzle(current.beatId, correct);
    } catch {
      notBefore.current = 0;
      setPuzzleState("idle");
      setCommit(null);
    }
  };

  const share = () => {
    if (!current?.ending) return;
    Share.share({
      message: `Fork \u00B7 ${episodeTitle}\nI reached \u201C${current.ending.title}\u201D.\n${current.ending.path.join(" \u2192 ")}\n${streak}-day streak.`,
    }).catch(() => {});
  };

  const aspect = (active >= 0 && slots[active].aspect) || PORTRAIT;
  const scale = aspect < 1 ? Math.max(width / aspect, height) : Math.min(width / aspect, height);
  const video = { x: (width - aspect * scale) / 2, y: (height - scale) / 2, w: aspect * scale, h: scale };
  const micSpace = micOn ? MIC_SPACE : 0;
  const bandHeight = (slotAspect: number | null) => Math.max(0, (height - width / (slotAspect ?? PORTRAIT)) / 2);
  const captionLift = choice ? chipsHeight(choice.options) + micSpace : 0;
  const stopLine =
    held && current.stop
      ? listening
        ? "Listening\u2026"
        : heard !== null
          ? `\u201C${heard}\u201D`
          : (reply ?? current.stop.spokenLine)
      : null;

  return (
    <View style={[StyleSheet.absoluteFill, active >= 0 && { backgroundColor: colors.black }]}>
      {SLOTS.map((i) => {
        const visible = i === active || i === previous;
        const letterboxed = (slots[i].aspect ?? PORTRAIT) >= 1;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: visible ? 1 : 0,
                zIndex: i === active ? 2 : i === previous ? 1 : 0,
                backgroundColor: letterboxed && visible && !slots[i].backdrop ? colors.black : "transparent",
                transform: [{ scale: (i === active && phase === "held") || i === previous ? holdScale : 1 }],
              },
            ]}
          >
            <VideoView
              player={players[i]}
              nativeControls={false}
              allowsPictureInPicture={false}
              allowsVideoFrameAnalysis={false}
              contentFit={letterboxed ? "contain" : "cover"}
              style={[StyleSheet.absoluteFill, { backgroundColor: "transparent" }]}
            />
            {letterboxed &&
              slots[i].backdrop &&
              [0, height - bandHeight(slots[i].aspect)].map((top) => (
                <View key={top} style={{ position: "absolute", left: 0, right: 0, top, height: bandHeight(slots[i].aspect), overflow: "hidden" }}>
                  <Image
                    source={slots[i].backdrop}
                    blurRadius={letterbox.blur}
                    contentFit="cover"
                    style={{ position: "absolute", left: 0, width, top: -top, height }}
                  />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.letterboxVeil }]} />
                </View>
              ))}
          </Animated.View>
        );
      })}

      {active >= 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 3 }]}>
          <LinearGradient colors={gradients.playerTop.colors} locations={gradients.playerTop.locations} style={[styles.shade, { top: 0, height: insets.top + 90 }]} />
          <LinearGradient colors={gradients.playerBottom.colors} locations={gradients.playerBottom.locations} style={[styles.shade, { bottom: 0, height: height * 0.4 }]} />
        </View>
      )}

      <View style={[StyleSheet.absoluteFill, { zIndex: 4 }]}>
        <Pressable accessibilityLabel="Show controls" style={StyleSheet.absoluteFill} onPress={() => active >= 0 && setChrome((c) => !c)} />

        <Presence show={held && phase === "held"} duration={900}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.holdDim }]} />
        </Presence>

        <Presence show={(captionsOn || listening || heard !== null || reply !== null) && current !== null && !puzzle && !ending}>
          <View pointerEvents="none" style={[styles.captions, { bottom: insets.bottom + 34 }]}>
            {current && (
              <Captions key={`${current.beatId}:${stopLine === null ? "clip" : "stop"}`} text={stopLine ?? current.narration} lift={captionLift} />
            )}
          </View>
        </Presence>

        <Presence show={choice !== null} duration={200}>
          {choice && current && (
            <ChoiceOverlay
              key={current.beatId}
              options={choice.options}
              video={video}
              holdScale={holdScale}
              picked={picked}
              onPick={pick}
              bottomInset={insets.bottom + micSpace}
              screenWidth={width}
              safe={{ top: insets.top + TARGET_TOP_CLEARANCE, bottom: height - insets.bottom - CAPTION_CLEARANCE - captionLift }}
            />
          )}
        </Presence>

        <Presence show={choice !== null && micOn && (picked === null || voiceBusy)} duration={200}>
          <View pointerEvents="box-none" style={[styles.mic, { bottom: insets.bottom + 12 }]}>
            {mic}
          </View>
        </Presence>

        <Presence show={puzzle !== null} duration={260}>
          {puzzle && current && (
            <PuzzleSheet
              key={current.beatId}
              puzzle={puzzle}
              line={stopLine}
              accessory={micOn ? mic : null}
              state={puzzleState}
              onSubmit={submit}
              bottomInset={insets.bottom}
            />
          )}
        </Presence>

        <Presence show={ending !== null} duration={700}>
          {ending && <EndingCard ending={ending} streak={streak} onShare={share} onDone={onExit} bottomInset={insets.bottom} />}
        </Presence>

        <Presence show={current !== null && !ending}>
          <View pointerEvents="none" style={[styles.dots, { top: insets.top + 16 }]}>
            {current && <BeatDots index={current.beatIndex} total={current.beatsTotal} />}
          </View>
        </Presence>

        <Presence show={chrome && !ending}>
          <View pointerEvents="box-none" style={[styles.chrome, { top: insets.top + 2 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onExit} style={styles.control}>
              <View style={[styles.cross, { transform: [{ rotate: "45deg" }] }]} />
              <View style={[styles.cross, { transform: [{ rotate: "-45deg" }] }]} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={10} onPress={() => setSettingsOpen(true)} style={styles.control}>
              <SettingsGlyph />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={captionsOn ? "Turn captions off" : "Turn captions on"}
              hitSlop={10}
              onPress={() => {
                setCaptionsOn((on) => !on);
                setChrome(true);
              }}
              style={styles.control}
            >
              <Text style={[styles.cc, !captionsOn && { color: colors.faint, borderColor: colors.faint }]}>CC</Text>
            </Pressable>
          </View>
        </Presence>
      </View>
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} bottomInset={insets.bottom} />}
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { position: "absolute", left: 0, right: 0 },
  captions: { position: "absolute", left: 30, right: 30 },
  dots: { position: "absolute", left: 0, right: 0 },
  chrome: { position: "absolute", left: 14, right: 14, flexDirection: "row" },
  mic: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  control: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  cross: { position: "absolute", width: 20, height: 1.5, borderRadius: 1, backgroundColor: colors.text },
  cc: {
    fontFamily: fonts.ui,
    fontWeight: "600",
    fontSize: type.micro,
    letterSpacing: 1,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: radius.control,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: "hidden",
  },
});
