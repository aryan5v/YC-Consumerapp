import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { glass } from "../theme";

const liquid = isLiquidGlassAvailable();

function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

// A control surface floating over video. Children sit above the material.
export function Glass({
  style,
  tinted = false,
  interactive = false,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  tinted?: boolean;
  interactive?: boolean;
  children?: ReactNode;
}) {
  const reduceTransparency = useReduceTransparency();
  if (reduceTransparency) {
    return <View style={[style, { backgroundColor: glass.solidFill, overflow: "hidden" }]}>{children}</View>;
  }
  if (liquid) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        isInteractive={interactive}
        tintColor={tinted ? glass.tint : undefined}
        style={[style, { overflow: "hidden" }]}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, { overflow: "hidden" }]}>
      <BlurView intensity={glass.fallbackBlur} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tinted ? glass.tint : glass.fallbackFill }]} />
      {children}
    </View>
  );
}
