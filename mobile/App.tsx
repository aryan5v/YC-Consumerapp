import { setAudioModeAsync } from "expo-audio";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { Component, type ReactNode, useCallback, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Dream } from "./src/components/Dream";
import { SettingsSheet } from "./src/components/SettingsSheet";
import { convexStory, mockStory, StoryContext, useStory } from "./src/data";
import { setSetting, useSettings } from "./src/settings";
import { Home } from "./src/screens/Home";
import { Player } from "./src/screens/Player";
import { World } from "./src/screens/World";
import { useReduceMotion } from "./src/a11y";
import { colors, ease, fontFiles, fonts, motion, radius, type } from "./src/theme";

setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});

function Shell() {
  const story = useStory();
  const home = story.useHome();
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [settings, setSettings] = useState(false);
  const [world, setWorld] = useState(false);
  const [dream, setDream] = useState(false);
  const reduceMotion = useReduceMotion();
  const worldIn = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const cover = useRef(new Animated.Value(0)).current;

  const openWorld = () => {
    setWorld(true);
    Animated.timing(worldIn, { toValue: 1, duration: reduceMotion ? motion.instant : motion.slow, easing: ease.out, useNativeDriver: true }).start();
  };

  const closeWorld = () => {
    Animated.timing(worldIn, { toValue: 0, duration: reduceMotion ? motion.instant : motion.base, easing: ease.out, useNativeDriver: true }).start(() => setWorld(false));
  };

  const play = async () => {
    if (!home || starting) return;
    setStarting(true);
    try {
      const resume = home.run && (home.run.status === "active" || !story.canReplay);
      setRunId(resume && home.run ? home.run.id : await story.startToday());
    } catch {
      setStarting(false);
    }
  };

  const started = useCallback(() => {
    setPlaying(true);
    Animated.timing(cover, { toValue: 1, duration: motion.slow, easing: ease.out, useNativeDriver: true }).start();
  }, [cover]);

  const exit = useCallback(() => {
    setPlaying(false);
    Animated.timing(cover, { toValue: 0, duration: motion.base, easing: ease.out, useNativeDriver: true }).start(() => {
      setRunId(null);
      setStarting(false);
    });
  }, [cover]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden={playing || world || dream} animated />
      <Home starting={starting} onPlay={play} onWander={story.interact ? openWorld : undefined} onDream={() => setDream(true)} onSettings={() => setSettings(true)} />
      {world && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: worldIn }]}>
          <World active={!playing && !runId} onClose={closeWorld} onStory={play} />
        </Animated.View>
      )}
      {runId && home && (
        <Animated.View pointerEvents={playing ? "auto" : "none"} style={[StyleSheet.absoluteFill, { opacity: cover }]}>
          <Player runId={runId} streak={home.streak} episodeTitle={home.episode.title} onStarted={started} onExit={exit} />
        </Animated.View>
      )}
      {dream && <Dream onClose={() => setDream(false)} />}
      {settings && <SettingsSheet onClose={() => setSettings(false)} bottomInset={insets.bottom} />}
    </View>
  );
}

class StoryError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <View style={[styles.root, { justifyContent: "center", padding: 28, gap: 20 }]}>
      <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: type.hero }}>The signal went quiet.</Text>
      <Text style={{ color: colors.dim, fontFamily: fonts.ui, fontSize: type.body }}>The live story is unavailable. You can still play the demo.</Text>
      <Pressable accessibilityRole="button" onPress={() => setSetting("demo", true)} style={{ padding: 18, backgroundColor: colors.accent, borderRadius: radius.button }}>
        <Text style={{ color: colors.accentInk, fontFamily: fonts.uiSemibold, fontSize: type.control }}>Play demo story</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => this.setState({ failed: false })} style={{ padding: 16 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.ui, fontSize: type.control }}>Try again</Text>
      </Pressable>
    </View>;
  }
}

function Story() {
  const { demo } = useSettings();
  const story = demo || !convexStory ? mockStory : convexStory;
  return (
    <StoryError key={story.name}><story.Root>
      <StoryContext.Provider value={story}>
        <Shell />
      </StoryContext.Provider>
    </story.Root></StoryError>
  );
}

export default function App() {
  const [loaded] = useFonts(fontFiles);
  if (!loaded) return <View style={styles.root} />;
  return (
    <SafeAreaProvider>
      <Story />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
