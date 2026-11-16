import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { directorCompletion, parseJSONObject } from "./lib/deepseek";
import { synthesizeWithModel, transcribeWithModel } from "./lib/openai";

export const verify = internalAction({
  args: {},
  returns: v.any(),
  handler: async () => {
    const directorStarted = Date.now();
    const director = await directorCompletion([
      { role: "system", content: "Return one JSON object only, with a boolean field ok." },
      { role: "user", content: "Set ok to true." },
    ], 1000);
    if ((parseJSONObject(director.text) as { ok?: boolean }).ok !== true) throw new Error("director model check failed");
    const directorMs = Date.now() - directorStarted;
    const speechStarted = Date.now();
    const speech = await synthesizeWithModel({ text: "The parcel is on the harbour counter.", voice: "marin" });
    const speechMs = Date.now() - speechStarted;
    const transcriptionStarted = Date.now();
    const transcript = await transcribeWithModel(speech.audio, "audio/mpeg");
    const transcriptionMs = Date.now() - transcriptionStarted;
    if (!/parcel/i.test(transcript.text)) throw new Error("transcription model check failed");
    return {
      director: { model: director.model, milliseconds: directorMs },
      speech: { model: speech.model, milliseconds: speechMs, bytes: speech.audio.size },
      transcription: { model: transcript.model, milliseconds: transcriptionMs, matched: true },
    };
  },
});
