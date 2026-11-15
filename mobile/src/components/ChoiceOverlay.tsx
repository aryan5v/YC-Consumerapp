import { BlurView } from "expo-blur";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import type { ChoiceOption } from "../data";
import { colors, ease, fonts, glow, motion, radius, type } from "../theme";
import { Ring } from "./Ring";

export type Rect = { x: number; y: number; w: number; h: number };

const CHIP_HEIGHT = 56;
const CHIP_GAP = 10;

export function chipsHeight(options: ChoiceOption[]) {
  const chips = options.filter((o) => o.box === null).length;
  return chips === 0 ? 0 : chips * CHIP_HEIGHT + (chips - 1) * CHIP_GAP + 22;
}

function useTarget(index: number, picked: string | null, id: string) {
  const appear = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: motion.gentle, delay: 120 + index * 110, easing: ease.out, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: motion.pulse, delay: index * 260, easing: ease.inOut, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: motion.pulse, easing: ease.inOut, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [appear, pulse, index]);

  useEffect(() => {
    if (picked === null) {
      fade.setValue(1);
      return;
    }
    if (picked !== id) {
      Animated.timing(fade, { toValue: 0, duration: motion.quick, easing: ease.out, useNativeDriver: true }).start();
      return;
    }
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: motion.instant, easing: ease.out, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: motion.base, easing: ease.out, useNativeDriver: true }),
    ]).start();
  }, [picked, id, fade, flash]);

  return { appear, pulse, flash, opacity: Animated.multiply(appear, fade) };
}

type TargetProps = {
  option: ChoiceOption;
  index: number;
  picked: string | null;
  onPick: (id: string) => void;
};

const LABEL_WIDTH = 220;

function Outline({
  option,
  index,
  picked,
  onPick,
  frame,
  labelAbove,
  screenWidth,
}: TargetProps & { frame: Rect; labelAbove: boolean; screenWidth: number }) {
  const { appear, pulse, flash, opacity } = useTarget(index, picked, option.id);
  const radius = Math.min(glow.maxRadius, Math.min(frame.w, frame.h) / 4);
  const waiting = picked === option.id;

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: frame.x,
        top: frame.y,
        width: frame.w,
        height: frame.h,
        opacity,
        transform: [
          { scale: Animated.add(appear.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }), flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.035] })) },
        ],
      }}
    >
      <Animated.View
        style={[
          styles.bloom,
          { borderRadius: radius + glow.bloomWidth, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: glow.bloomOpacity }) },
        ]}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.halo,
          {
            borderRadius: radius,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: glow.haloOpacity }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, glow.haloScale] }) }],
          },
        ]}
      />
      <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: radius }]} />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, backgroundColor: glow.color, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, glow.flashOpacity] }) },
        ]}
      />
      {waiting && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Ring size={30} color={glow.color} delay={320} />
        </View>
      )}
      <View
        style={[
          styles.labelWrap,
          { left: Math.min(Math.max(frame.x + frame.w / 2 - LABEL_WIDTH / 2, 10), screenWidth - LABEL_WIDTH - 10) - frame.x },
          labelAbove ? { bottom: frame.h + 10 } : { top: frame.h + 10 },
        ]}
      >
        <Text numberOfLines={1} style={styles.outlineLabel}>
          {option.label}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        disabled={picked !== null}
        hitSlop={10}
        onPress={() => onPick(option.id)}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function Chip({ option, index, picked, onPick }: TargetProps) {
  const { appear, pulse, flash, opacity } = useTarget(index, picked, option.id);
  const waiting = picked === option.id;

  return (
    <Animated.View
      style={{
        opacity,
        transform: [
          { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          { scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) },
        ],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        disabled={picked !== null}
        onPress={() => onPick(option.id)}
        style={styles.chip}
      >
        <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: glow.color, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }]}
        />
        <View style={styles.chipLead}>
          {waiting ? (
            <Ring size={18} color={glow.color} delay={320} />
          ) : (
            <Animated.View
              style={[
                styles.dot,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }],
                },
              ]}
            />
          )}
        </View>
        <Text numberOfLines={1} style={styles.chipLabel}>
          {option.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function ChoiceOverlay({
  options,
  video,
  holdScale,
  picked,
  onPick,
  bottomInset,
  screenWidth,
}: {
  options: ChoiceOption[];
  video: Rect;
  holdScale: Animated.Value;
  picked: string | null;
  onPick: (id: string) => void;
  bottomInset: number;
  screenWidth: number;
}) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform: [{ scale: holdScale }] }]}>
        {options.map((o, i) => {
          if (o.box === null) return null;
          const frame = { x: video.x + o.box.x * video.w, y: video.y + o.box.y * video.h, w: o.box.w * video.w, h: o.box.h * video.h };
          return (
            <Outline
              key={o.id}
              option={o}
              index={i}
              picked={picked}
              onPick={onPick}
              frame={frame}
              screenWidth={screenWidth}
              labelAbove={frame.y + frame.h > video.y + video.h * 0.72}
            />
          );
        })}
      </Animated.View>
      <View pointerEvents="box-none" style={[styles.chips, { bottom: bottomInset + 14 }]}>
        {options.map((o, i) => (o.box === null ? <Chip key={o.id} option={o} index={i} picked={picked} onPick={onPick} /> : null))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    borderWidth: glow.haloWidth,
    borderColor: glow.color,
    shadowColor: glow.color,
    shadowOpacity: 1,
    shadowRadius: glow.blur,
    shadowOffset: { width: 0, height: 0 },
  },
  edge: { borderWidth: glow.edgeWidth, borderColor: glow.color, opacity: 0.9 },
  center: { alignItems: "center", justifyContent: "center" },
  bloom: {
    position: "absolute",
    left: -glow.bloomWidth,
    right: -glow.bloomWidth,
    top: -glow.bloomWidth,
    bottom: -glow.bloomWidth,
    borderWidth: glow.bloomWidth,
    borderColor: glow.color,
  },
  labelWrap: { position: "absolute", width: LABEL_WIDTH, alignItems: "center" },
  outlineLabel: {
    fontFamily: fonts.ui,
    fontWeight: "600",
    fontSize: type.tag,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.text,
    textShadowColor: colors.textShadow,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 1 },
  },
  chips: { position: "absolute", left: 18, right: 18, gap: CHIP_GAP },
  chip: {
    height: CHIP_HEIGHT,
    borderRadius: radius.pill,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  chipLead: { width: 52, alignItems: "center", justifyContent: "center" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: glow.color,
    shadowColor: glow.color,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  chipLabel: { flex: 1, fontFamily: fonts.ui, fontWeight: "500", fontSize: type.body, letterSpacing: 0.1, color: colors.text },
});
