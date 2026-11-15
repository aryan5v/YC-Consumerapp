import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import type { ChoiceOption } from "../data";
import { colors, ease, fonts, glow, motion, radius, type } from "../theme";
import { useReduceMotion } from "../a11y";
import { Glass } from "./Glass";
import { Ring } from "./Ring";

export type Rect = { x: number; y: number; w: number; h: number };

const CHIP_HEIGHT = 48;
const SIDE_MARGIN = 24;
const MIN_TARGET = 64;
const CHIP_GAP = 12;

export function chipsHeight(options: ChoiceOption[]) {
  const chips = options.filter((o) => o.box === null).length;
  return chips === 0 ? 0 : chips * CHIP_HEIGHT + (chips - 1) * CHIP_GAP + 22;
}

function useTarget(index: number, picked: string | null, id: string) {
  const appear = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const chosen = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const reduce = useReduceMotion();
  const still = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) {
      pulse.setValue(0.6);
      Animated.timing(appear, { toValue: 1, duration: motion.gentle, easing: ease.out, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(appear, { toValue: 1, duration: motion.gentle, delay: 120 + index * 110, easing: ease.out, useNativeDriver: true }).start();
    const period = picked === id ? motion.waitPulse : motion.pulse;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: period / 2, easing: ease.inOut, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: period / 2, easing: ease.inOut, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [appear, pulse, index, reduce, picked, id]);

  useEffect(() => {
    if (picked === null) {
      fade.setValue(1);
      chosen.setValue(0);
      return;
    }
    if (picked !== id) {
      Animated.timing(fade, { toValue: 0, duration: motion.fade, easing: ease.out, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(chosen, { toValue: 1, duration: motion.instant, easing: ease.out, useNativeDriver: true }).start();
    if (reduce) return;
    const [, peak, settle] = glow.chosenScale;
    Animated.sequence([
      Animated.timing(pop, { toValue: peak, duration: motion.chosen * 0.4, easing: ease.out, useNativeDriver: true }),
      Animated.timing(pop, { toValue: settle, duration: motion.chosen * 0.6, easing: ease.out, useNativeDriver: true }),
    ]).start();
  }, [picked, id, fade, chosen, pop, reduce]);

  return {
    appear: reduce ? still : appear,
    pulse,
    chosen,
    pop,
    opacity: Animated.multiply(appear, fade),
  };
}

type TargetProps = {
  option: ChoiceOption;
  index: number;
  picked: string | null;
  onPick: (id: string) => void;
};

const LABEL_WIDTH = 240;

function Outline({ option, index, picked, onPick, frame, screenWidth }: TargetProps & { frame: Rect; screenWidth: number }) {
  const { appear, pulse, chosen, pop, opacity } = useTarget(index, picked, option.id);
  const r = Math.min(glow.radius, Math.min(frame.w, frame.h) / 4);
  const waiting = picked === option.id;
  const ring = (inset: number, extra: object) => [
    { position: "absolute" as const, left: -inset, right: -inset, top: -inset, bottom: -inset, borderRadius: r + inset },
    extra,
  ];

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: frame.x,
        top: frame.y,
        width: frame.w,
        height: frame.h,
        opacity,
        transform: [{ scale: Animated.multiply(appear.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }), pop) }],
      }}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: r, backgroundColor: glow.color, opacity: chosen.interpolate({ inputRange: [0, 1], outputRange: [glow.wash, glow.washChosen] }) },
        ]}
      />
      <View style={ring(glow.contrastWidth / 2, { borderWidth: glow.contrastWidth, borderColor: glow.contrast })} />
      <Animated.View
        style={ring(glow.haloWidth / 2 - 1, [
          styles.halo,
          {
            borderWidth: glow.haloWidth,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: glow.haloOpacity }),
          },
        ])}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: r,
            borderWidth: glow.coreWidth,
            borderColor: glow.core,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: glow.coreOpacity }),
          },
        ]}
      />
      {waiting && (
        <View style={[styles.waitRing, { left: frame.w / 2 - 14 }]}>
          <Ring size={28} color={glow.core} delay={320} />
        </View>
      )}
      {!waiting && (
        <View
          pointerEvents="none"
          style={[
            styles.labelWrap,
            {
              bottom: frame.h + glow.labelGap,
              left: Math.min(Math.max(frame.x + frame.w / 2 - LABEL_WIDTH / 2, 10), screenWidth - LABEL_WIDTH - 10) - frame.x,
            },
          ]}
        >
          <View style={styles.tag}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.tagText}>
              {option.label}
            </Text>
          </View>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityState={{ disabled: picked !== null, selected: picked === option.id }}
        disabled={picked !== null}
        hitSlop={10}
        onPress={() => onPick(option.id)}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function Chip({ option, index, picked, onPick }: TargetProps) {
  const { appear, pulse, chosen, pop, opacity } = useTarget(index, picked, option.id);
  const waiting = picked === option.id;

  return (
    <Animated.View
      style={[
        styles.chipShadow,
        {
          opacity,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: pop }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityState={{ disabled: picked !== null, selected: picked === option.id }}
        disabled={picked !== null}
        onPress={() => onPick(option.id)}
      >
        <Glass interactive style={styles.chip}>
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: glow.color, opacity: chosen.interpolate({ inputRange: [0, 1], outputRange: [0, glow.washChosen] }) }]}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.chipRing]} />
          <View style={styles.chipLead}>
            {waiting ? (
              <Ring size={18} color={glow.core} delay={320} />
            ) : (
              <Animated.View style={[styles.dot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: glow.coreOpacity }) }]} />
            )}
          </View>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={styles.chipLabel}>
            {option.label}
          </Text>
        </Glass>
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
  safe,
}: {
  options: ChoiceOption[];
  video: Rect;
  holdScale: Animated.Value;
  picked: string | null;
  onPick: (id: string) => void;
  bottomInset: number;
  screenWidth: number;
  safe: { top: number; bottom: number };
}) {
  const fit = (box: NonNullable<ChoiceOption["box"]>): Rect => {
    const left = Math.max(video.x + box.x * video.w, SIDE_MARGIN);
    const right = Math.min(video.x + (box.x + box.w) * video.w, screenWidth - SIDE_MARGIN);
    const top = Math.max(video.y + box.y * video.h, safe.top);
    const bottom = Math.min(video.y + (box.y + box.h) * video.h, safe.bottom);
    const w = Math.max(right - left, MIN_TARGET);
    const h = Math.max(bottom - top, MIN_TARGET);
    return { x: Math.min(left, screenWidth - SIDE_MARGIN - w), y: Math.min(top, safe.bottom - h), w, h };
  };
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform: [{ scale: holdScale }] }]}>
        {options.map((o, i) => {
          if (o.box === null) return null;
          const frame = fit(o.box);
          return (
            <Outline
              key={o.id}
              option={o}
              index={i}
              picked={picked}
              onPick={onPick}
              frame={frame}
              screenWidth={screenWidth}
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
    borderColor: glow.color,
    shadowColor: glow.color,
    shadowOpacity: 1,
    shadowRadius: glow.blur,
    shadowOffset: { width: 0, height: 0 },
  },
  waitRing: { position: "absolute", top: -34 - 28 / 2 },
  labelWrap: { position: "absolute", width: LABEL_WIDTH, alignItems: "center" },
  tag: {
    height: glow.labelHeight,
    paddingHorizontal: 8,
    borderRadius: radius.control,
    justifyContent: "center",
    backgroundColor: colors.tag,
  },
  tagText: {
    fontFamily: fonts.uiSemibold,
    fontSize: type.tag,
    letterSpacing: type.labelTracking,
    textTransform: "uppercase",
    color: colors.white,
  },
  chips: { position: "absolute", left: 18, right: 18, gap: CHIP_GAP },
  chipShadow: {
    shadowColor: glow.color,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  chip: {
    minHeight: CHIP_HEIGHT,
    paddingVertical: 8,
    borderRadius: radius.button,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 20,
  },
  chipRing: { borderRadius: radius.button, borderWidth: 1.75, borderColor: "rgba(255,255,255,0.9)" },
  chipLead: { width: 44, alignItems: "center", justifyContent: "center" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: glow.core,
    shadowColor: glow.color,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  chipLabel: { flex: 1, fontFamily: fonts.uiMedium, fontSize: type.label, color: colors.text },
});
