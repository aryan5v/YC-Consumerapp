import { useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Path, LinearGradient, Stop, Filter, FeGaussianBlur, Image as SvgImage, Mask, Rect as SvgRect, FeOffset, FeMerge, FeMergeNode, FeComposite, FeFlood } from "react-native-svg";
import type { ChoiceOption, Point } from "../data";
import { colors, ease, fonts, glow, motion, radius, type } from "../theme";
import { useReduceMotion } from "../a11y";
import { Glass } from "./Glass";
import { Ring } from "./Ring";

export type Rect = { x: number; y: number; w: number; h: number };
const CHIP_HEIGHT = 48;
const CHIP_GAP = 12;
const LABEL_WIDTH = 180;

const area = (ring: Point[]) => Math.abs(ring.reduce((sum, [x, y], i) => sum + x * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y, 0)) / 2;
const drawable = (o: ChoiceOption, video: Rect, screenWidth: number) => {
  const region = o.region;
  if (!region) return false;
  const left = (video.x + region.centroid.x * video.w) / screenWidth;
  if (left < 0.03 || left > 0.97 || region.centroid.y < 0.02 || region.centroid.y > 0.98) return false;
  const points = region.polygon;
  if (!points?.length) return !!region.maskUrl;
  const rings = typeof points[0][0] === "number" ? [points as Point[]] : (points as Point[][]);
  const total = rings.reduce((sum, ring) => sum + area(ring), 0);
  return total >= 0.005 && total <= 0.12;
};

export function chipsHeight(options: ChoiceOption[], video: Rect, screenWidth: number) {
  const chips = options.filter((o) => !drawable(o, video, screenWidth)).length;
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
    Animated.timing(appear, { toValue: 1, duration: motion.gentle, easing: ease.out, useNativeDriver: true }).start();
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
    opacity: fade,
  };
}

type TargetProps = {
  option: ChoiceOption;
  index: number;
  picked: string | null;
  onPick: (id: string) => void;
};


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
              <Ring size={18} delay={320} />
            ) : (
              <View style={styles.dot} />
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


function Silhouette({ option, index, picked, preview, onPick, video, screenWidth, safe }: TargetProps & { preview: string | null; video: Rect; screenWidth: number; safe: { top: number; bottom: number } }) {
  const region = option.region!;
  const reduce = useReduceMotion();
  const fill = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0.7)).current;
  const waiting = picked === option.id;
  const active = waiting || preview === option.id;
  useEffect(() => {
    Animated.timing(fill, { toValue: active ? 1 : 0, duration: reduce ? 0 : motion.silhouette, useNativeDriver: true }).start();
    Animated.timing(opacity, { toValue: picked && !waiting ? 0 : 1, duration: reduce ? 0 : motion.fade, useNativeDriver: true }).start();
  }, [picked, waiting, active, reduce, fill, opacity]);
  useEffect(() => {
    if (reduce) { pulse.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: motion.waitPulse / 2, easing: ease.inOut, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.65, duration: motion.waitPulse / 2, easing: ease.inOut, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [reduce, pulse]);
  const points = region.polygon;
  const polygons: Point[][] = !points?.length ? [] : typeof points[0][0] === "number" ? [points as Point[]] : points as Point[][];
  const d = polygons.map((p) => p.map(([x,y], i) => `${i ? "L" : "M"}${x * video.w},${y * video.h}`).join(" ") + " Z").join(" ");
  const id = "target" + index;
  const cx = region.centroid.x * video.w;
  const cy = region.centroid.y * video.h;
  const press = () => { if (!picked) onPick(option.id); };
  const defs = <Defs>
    <LinearGradient id={id + "fill"} x1="0%" y1="100%" x2="100%" y2="0%">
      <Stop offset="0" stopColor={glow.color} /><Stop offset="1" stopColor={glow.gradientEnd} />
    </LinearGradient>
    <Filter id={id + "blur"} x="-30%" y="-30%" width="160%" height="160%">
      <FeGaussianBlur stdDeviation={glow.silhouetteBlur} />
    </Filter>
    {region.maskUrl && <>
      <Mask id={id + "mask"} maskType="alpha" x="0" y="0" width={video.w} height={video.h} maskUnits="userSpaceOnUse">
        <SvgImage href={{ uri: region.maskUrl }} width={video.w} height={video.h} preserveAspectRatio="none" />
      </Mask>
      <Filter id={id + "edge"} x="-5%" y="-5%" width="110%" height="110%">
        <FeOffset in="SourceAlpha" dx="1.5" result="r" /><FeOffset in="SourceAlpha" dx="-1.5" result="l" />
        <FeOffset in="SourceAlpha" dy="1.5" result="b" /><FeOffset in="SourceAlpha" dy="-1.5" result="t" />
        <FeMerge result="expanded"><FeMergeNode in="r" /><FeMergeNode in="l" /><FeMergeNode in="b" /><FeMergeNode in="t" /></FeMerge>
        <FeComposite in="expanded" in2="SourceAlpha" operator="out" result="edge" />
        <FeFlood floodColor={glow.silhouette} /><FeComposite in2="edge" operator="in" />
      </Filter>
    </>}
  </Defs>;
  return <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity }]}>
    <View pointerEvents="box-none" style={{ position: "absolute", left: video.x, top: video.y, width: video.w, height: video.h }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fill }]}>
        <Svg width={video.w} height={video.h}>{defs}
          {d ? <>
            <Path d={d} fill={`url(#${id}fill)`} opacity={glow.silhouetteFill} />
            <Path d={d} fill="none" stroke={glow.color} strokeWidth={8} filter={`url(#${id}blur)`} opacity={0.7} />
          </> : <SvgRect width={video.w} height={video.h} fill={`url(#${id}fill)`} opacity={glow.silhouetteFill} mask={`url(#${id}mask)`} />}
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: pulse }]}>
        <Svg width={video.w} height={video.h} pointerEvents="box-none">{defs}
          {d ? <>
            <Path d={d} fill="none" stroke={colors.black} strokeOpacity={0.55} strokeWidth={4} />
            <Path d={d} fill="none" stroke={glow.silhouette} strokeWidth={4} filter={`url(#${id}blur)`} />
            <Path d={d} fill="transparent" stroke={glow.silhouette} strokeWidth={glow.silhouetteWidth} onPress={press} disabled={picked !== null} />
          </> : <SvgImage href={{ uri: region.maskUrl! }} width={video.w} height={video.h} preserveAspectRatio="none" filter={`url(#${id}edge)`} />}
        </Svg>
      </Animated.View>
      <Pressable accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ disabled: picked !== null, selected: waiting }}
        disabled={picked !== null} onPress={press}
        style={{ position: "absolute", left: cx - 22, top: cy - 22, width: 44, height: 44 }} />
    </View>
    <View pointerEvents="none" style={[styles.labelWrap, {
      left: Math.max(8, Math.min(screenWidth - LABEL_WIDTH - 8, video.x + cx - LABEL_WIDTH / 2)),
      top: Math.max(safe.top, Math.min(safe.bottom - 30, video.y + cy + 26)),
    }]}>
      <View style={styles.tag}>{waiting ? <Ring size={18} delay={320} /> : <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.tagText}>{option.label}</Text>}</View>
    </View>
  </Animated.View>;
}

export function ChoiceOverlay({ options, video, holdScale, picked, onPick, bottomInset, screenWidth, safe }: {
  options: ChoiceOption[]; video: Rect; holdScale: Animated.Value; picked: string | null;
  onPick: (id: string, actionId: string) => void; bottomInset: number; screenWidth: number; safe: { top: number; bottom: number };
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const selected = options.find((o) => o.id === preview);
  const select = (id: string) => {
    const option = options.find((o) => o.id === id);
    if (!option || picked) return;
    if (option.actions.length === 1) { onPick(id, option.actions[0].id); return; }
    setPreview(id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const actionsHeight = selected ? selected.actions.length * (CHIP_HEIGHT + CHIP_GAP) : 0;
  const actionTop = selected && drawable(selected, video, screenWidth) && selected.region ? Math.max(safe.top, Math.min(safe.bottom - actionsHeight, video.y + selected.region.centroid.y * video.h + 54)) : undefined;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { transform: [{ scale: holdScale }] }]}>
      {options.map((option, index) => drawable(option, video, screenWidth) ? <Silhouette key={option.id} {...{ option, index, picked, preview, video, screenWidth, safe }} onPick={select} /> : null)}
    </Animated.View>
    <View pointerEvents="box-none" style={[styles.chips, { bottom: bottomInset + 14 }]}>
      {!selected && options.map((option, index) => !drawable(option, video, screenWidth) ? <Chip key={option.id} {...{ option, index, picked }} onPick={select} /> : null)}
    </View>
    {selected && <View style={[styles.chips, actionTop === undefined ? { bottom: bottomInset + 14 } : { top: actionTop }]}>
      {selected.actions.map((action) => <Glass key={action.id} interactive style={styles.chip}>
        <Pressable disabled={picked !== null} accessibilityRole="button" accessibilityLabel={action.label}
          onPress={() => onPick(selected.id, action.id)} style={{ minHeight: CHIP_HEIGHT, flex: 1, justifyContent: "center", paddingHorizontal: 20 }}>
          <Text style={styles.chipLabel}>{action.label}</Text>
        </Pressable>
      </Glass>)}
    </View>}
  </View>;
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
  chipShadow: {},
  chip: {
    minHeight: CHIP_HEIGHT,
    paddingVertical: 8,
    borderRadius: radius.button,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 20,
  },
  chipRing: { borderRadius: radius.button, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(232,238,241,0.28)" },
  chipLead: { width: 44, alignItems: "center", justifyContent: "center" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text,
    opacity: 0.6,
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  chipLabel: { flex: 1, fontFamily: fonts.uiMedium, fontSize: type.label, color: colors.text },
});
