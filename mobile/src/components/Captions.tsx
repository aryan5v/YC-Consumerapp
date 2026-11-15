import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { colors, ease, fonts, motion, type } from "../theme";

export function Captions({ text, lift }: { text: string; lift: number }) {
  const appear = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(lift)).current;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: motion.base, delay: 180, easing: ease.out, useNativeDriver: true }).start();
  }, [appear]);

  useEffect(() => {
    Animated.timing(rise, { toValue: lift, duration: motion.base, easing: ease.out, useNativeDriver: true }).start();
  }, [lift, rise]);

  return (
    <Animated.Text
      style={[
        styles.text,
        {
          opacity: appear,
          transform: [
            { translateY: Animated.add(Animated.multiply(rise, -1), appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] })) },
          ],
        },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.ui,
    fontWeight: "500",
    fontSize: type.lead,
    lineHeight: 25,
    letterSpacing: 0.1,
    color: colors.text,
    textAlign: "center",
    textShadowColor: colors.textShadow,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 1 },
  },
});
