import { BlurView } from "expo-blur";
import { getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { colors, ease, motion, radius } from "../theme";
import { Ring } from "./Ring";

const MIN_MS = 350;

export function MicButton({
  busy,
  disabled,
  onListening,
  onRecording,
  onDenied,
}: {
  busy: boolean;
  disabled: boolean;
  onListening: (listening: boolean) => void;
  onRecording: (uri: string) => void;
  onDenied: () => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [listening, setListening] = useState(false);
  const held = useRef(false);
  const recording = useRef(false);
  const startedAt = useRef(0);
  const appear = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: motion.gentle, delay: 700, easing: ease.out, useNativeDriver: true }).start();
  }, [appear]);

  useEffect(() => {
    if (!listening) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: motion.pulse, easing: ease.out, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    if (recording.current) finish();
  };

  return (
    <Animated.View style={{ opacity: Animated.multiply(appear, disabled && !busy ? 0.4 : 1) }}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.wave,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [listening ? 0.7 : 0, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
          },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hold to talk"
        disabled={disabled || busy}
        hitSlop={8}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={[styles.button, listening && styles.listening]}
      >
        {!listening && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />}
        {busy ? (
          <Ring size={18} />
        ) : (
          <View style={styles.mic}>
            <View style={[styles.capsule, listening && { backgroundColor: colors.bg }]} />
            <View style={[styles.cradle, listening && { borderColor: colors.bg }]} />
            <View style={[styles.stem, listening && { backgroundColor: colors.bg }]} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wave: { borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.text },
  button: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  listening: { backgroundColor: colors.text },
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
