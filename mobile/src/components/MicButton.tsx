import { getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useReduceMotion } from "../a11y";
import { colors, ease, motion, radius } from "../theme";
import { Glass } from "./Glass";
import { Ring } from "./Ring";

const MIN_MS = 350;

function Wrap({ bare, children }: { bare: boolean; children: ReactNode }) {
  if (bare) return <View style={[styles.button, styles.bare]}>{children}</View>;
  return (
    <Glass interactive style={styles.button}>
      {children}
    </Glass>
  );
}
const PRESS = { scale: 1.18, duration: 140, easing: Easing.bezier(0.2, 0.9, 0.3, 1.3) };
const RING = 6;
const GLOW = 24;
const RING_OPACITY = 0.35;

export function MicButton({
  busy,
  disabled,
  onListening,
  onRecording,
  onDenied,
  bare = false,
}: {
  busy: boolean;
  disabled: boolean;
  onListening: (listening: boolean) => void;
  onRecording: (uri: string) => void;
  onDenied: () => void;
  bare?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [listening, setListening] = useState(false);
  const held = useRef(false);
  const recording = useRef(false);
  const startedAt = useRef(0);
  const appear = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  const scaleTo = (toValue: number) => {
    if (reduceMotion) return;
    Animated.timing(press, { toValue, duration: PRESS.duration, easing: PRESS.easing, useNativeDriver: true }).start();
  };

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: motion.gentle, easing: ease.out, useNativeDriver: true }).start();
  }, [appear]);

  const playback = () => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

  const finish = async () => {
    const duration = Date.now() - startedAt.current;
    recording.current = false;
    setListening(false);
    onListening(false);
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    await playback();
    if (uri && duration >= MIN_MS) onRecording(uri);
  };

  const pressIn = async () => {
    held.current = true;
    scaleTo(PRESS.scale);
    let permission;
    try {
      permission = await getRecordingPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) permission = await requestRecordingPermissionsAsync();
    } catch {
      return;
    }
    if (!permission.granted) {
      held.current = false;
      onDenied();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!held.current) {
        await playback();
        return;
      }
      recorder.record();
      recording.current = true;
      startedAt.current = Date.now();
      setListening(true);
      onListening(true);
      if (!held.current) finish();
    } catch {
      recording.current = false;
      setListening(false);
      onListening(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      await playback();
    }
  };

  const pressOut = () => {
    held.current = false;
    scaleTo(1);
    if (recording.current) finish();
  };

  return (
    <Animated.View style={{ opacity: Animated.multiply(appear, disabled && !busy ? 0.4 : 1), transform: [{ scale: press }] }}>
      {listening && <View pointerEvents="none" style={styles.listeningRing} />}
      <Wrap bare={bare}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hold to talk"
        accessibilityHint="Double-tap and hold, then speak your answer."
        disabled={disabled || busy}
        hitSlop={8}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={styles.hit}
      >
        {busy ? (
          <Ring size={18} />
        ) : (
          <View style={styles.mic}>
            <View style={styles.capsule} />
            <View style={styles.cradle} />
            <View style={styles.stem} />
          </View>
        )}
      </Pressable>
      </Wrap>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  listeningRing: {
    position: "absolute",
    top: -RING,
    left: -RING,
    right: -RING,
    bottom: -RING,
    borderRadius: radius.round,
    borderWidth: RING,
    borderColor: colors.accent,
    opacity: RING_OPACITY,
    shadowColor: colors.accent,
    shadowOpacity: 1,
    shadowRadius: GLOW,
    shadowOffset: { width: 0, height: 0 },
  },
  button: { width: 60, height: 60, borderRadius: radius.round },
  bare: { backgroundColor: colors.wash, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  hit: { flex: 1, alignItems: "center", justifyContent: "center" },
  mic: { alignItems: "center" },
  capsule: { width: 7, height: 12, borderRadius: 3.5, backgroundColor: colors.text },
  cradle: {
    width: 13,
    height: 8,
    marginTop: -5,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: colors.text,
  },
  stem: { width: 1.5, height: 3.5, backgroundColor: colors.text },
});
