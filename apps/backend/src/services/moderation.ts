/**
 * Content moderation service.
 *
 * In production, use @tensorflow-models/nsfwjs or AWS Rekognition.
 * This is a placeholder that implements the interface so the upload
 * pipeline is wired up correctly.
 */

export interface ModerationResult {
  safe: boolean;
  score: number; // 0 = safe, 1 = definitely NSFW
  needsReview: boolean;
}

export async function moderateImage(
  _buffer: Buffer
): Promise<ModerationResult> {
  // TODO: integrate nsfwjs or AWS Rekognition
  //
  // Production implementation:
  //   import * as tf from "@tensorflow/tfjs-node";
  //   import * as nsfwjs from "nsfwjs";
  //   const model = await nsfwjs.load();
  //   const image = await tf.node.decodeImage(buffer, 3);
  //   const predictions = await model.classify(image as tf.Tensor3D);
  //   image.dispose();
  //   const nsfwScore = predictions
  //     .filter(p => p.className === "Porn" || p.className === "Hentai")
  //     .reduce((sum, p) => sum + p.probability, 0);
  //
  //   return {
  //     safe: nsfwScore < 0.5,
  //     score: nsfwScore,
  //     needsReview: nsfwScore >= 0.5 && nsfwScore < 0.85,
  //   };

  return {
    safe: true,
    score: 0,
    needsReview: false,
  };
}
