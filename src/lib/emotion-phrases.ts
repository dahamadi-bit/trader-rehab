/**
 * Pre-trade and post-trade phrase templates for each emotion
 * Designed for your profile: prop trader, intraday trading, retail bias mitigation
 */

export type TradeEmotion = 'calm' | 'excited' | 'fearful' | 'uncertain' | 'frustrated' | 'overconfident';

export const EMOTION_PHRASES: Record<TradeEmotion, {
  preTradeOptions: string[];
  postTradeOptions: string[];
}> = {
  calm: {
    preTradeOptions: [
      "I see a clear setup and I can stay disciplined",
      "Good risk-reward, I've planned this trade",
      "Market conditions favor my bias, I'm ready",
      "I feel steady — this is exactly my setup",
    ],
    postTradeOptions: [
      "I executed the plan perfectly, no emotion",
      "Good entry, good exit — discipline paid off",
      "I waited for confirmation like I promised myself",
      "I stuck to my thesis and it worked",
      "No interference with the trade — clean execution",
    ],
  },

  excited: {
    preTradeOptions: [
      "I see a STRONG setup and I want to catch this move",
      "Market is moving fast — energy is high",
      "This is the setup I'm waiting for all day",
      "I'm excited but I'll size appropriately",
    ],
    postTradeOptions: [
      "My excitement made me hold too long",
      "I got caught up in the action and held past TP",
      "Energy was high but I should have exited cleanly",
      "Excitement led me to revenge trade after this one",
      "I was right about direction but left money on table",
    ],
  },

  fearful: {
    preTradeOptions: [
      "I'm nervous but my thesis is solid and stops are tight",
      "Fear is healthy — I'm using tight stops as shield",
      "I'm scared I'll miss this, but I'll respect my plan",
      "Fear of loss is greater than FOMO — taking this setup",
    ],
    postTradeOptions: [
      "My fear made me exit early and miss the move",
      "Fear caused me to cut profit short on good trade",
      "I was right but fear made me take -50% of TP",
      "Fear kept me safe — I hit my stop and moved on",
      "Fear made me second-guess my entry and added to loss",
    ],
  },

  uncertain: {
    preTradeOptions: [
      "Setup is unclear but risk-reward is good, so I'll take it small",
      "Mixed signals — I'm not 100% sure, sizing down",
      "I'll wait for more confirmation but entry is here",
      "Uncertain about direction — this is a 0.5% trade only",
    ],
    postTradeOptions: [
      "My uncertainty was justified — mixed signals led to loss",
      "I was right to size small — protected me",
      "Uncertainty caused me to exit early on winner",
      "I should have waited for clearer setup",
      "Unclear bias led me to add to losing position",
    ],
  },

  frustrated: {
    preTradeOptions: [
      "Previous loss is making me impatient — I need this trade",
      "I want to recover my loss — this setup looks good",
      "I'm frustrated but I'll follow the plan not my emotions",
      "Last loss stung — I'm taking this to feel in control",
    ],
    postTradeOptions: [
      "Frustration made me revenge trade and add to loss",
      "I got emotional and doubled down after stop loss",
      "Frustration caused me to skip my pause and overtrade",
      "My emotional state led me to poor execution",
      "I broke my own rule because I was frustrated",
      "Frustration trade — never works out for me",
    ],
  },

  overconfident: {
    preTradeOptions: [
      "I'm overconfident about this setup — sizing it at 0.5% only",
      "I feel unstoppable — this is the time to stay disciplined",
      "I know this pattern but overconfidence kills traders",
      "I'm too confident — I'll move stops wider but size small",
    ],
    postTradeOptions: [
      "Overconfidence made me hold past TP for more",
      "I was overconfident and didn't respect my stop",
      "Overconfidence = wide stops = big losses",
      "I felt invincible and ignored my risk management",
      "Overconfidence made me take 3 revenge trades in a row",
      "I got cocky and added to position — rookie mistake",
    ],
  },
};

/**
 * Get phrase suggestions for a specific emotion and timing
 */
export function getPhrases(emotion: TradeEmotion, timing: 'pre' | 'post'): string[] {
  if (timing === 'pre') {
    return EMOTION_PHRASES[emotion]?.preTradeOptions || [];
  }
  return EMOTION_PHRASES[emotion]?.postTradeOptions || [];
}

/**
 * Get random phrase for a specific emotion
 */
export function getRandomPhrase(emotion: TradeEmotion, timing: 'pre' | 'post'): string {
  const phrases = getPhrases(emotion, timing);
  if (phrases.length === 0) return '';
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Recommended emotions for trading (confidence level 6-9 sweet spot)
 */
export const IDEAL_EMOTION_RANGE = {
  min: 6,
  max: 9,
  ideal: ['calm', 'uncertain'] as TradeEmotion[],
};

/**
 * Risky emotions (require warning)
 */
export const RISKY_EMOTIONS = {
  veryRisky: ['excited', 'frustrated', 'overconfident'] as TradeEmotion[],
  moderatelyRisky: ['fearful'] as TradeEmotion[],
};

/**
 * Check if emotion + confidence combo is in ideal range
 */
export function isEmotionInIdealRange(emotion: TradeEmotion, confidence: number): boolean {
  return confidence >= 6 && confidence <= 9;
}

/**
 * Get warning message for risky emotion
 */
export function getEmotionWarning(emotion: TradeEmotion, confidence: number): string | null {
  if (!isEmotionInIdealRange(emotion, confidence)) {
    if (confidence < 6) {
      return `Low confidence (${confidence}/10). Consider waiting 15 min to recalibrate before trading.`;
    }
    if (confidence > 9) {
      return `Overconfidence detected (${confidence}/10). Cap your sizing to 0.5%.`;
    }
  }

  if (RISKY_EMOTIONS.veryRisky.includes(emotion)) {
    return `⚠️ ${emotion} is a high-risk emotional state. Proceed with caution and reduced sizing.`;
  }

  if (RISKY_EMOTIONS.moderatelyRisky.includes(emotion)) {
    return `${emotion} can cloud judgment. Use tight stops.`;
  }

  return null;
}
