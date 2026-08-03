import { describe, expect, it } from 'vitest';
import { AudioFeedbackRateLimiter } from '@/audio/playback/audio_feedback_rate_limiter.js';

describe('AudioFeedbackRateLimiter', () => {
  it('allows the first snap and only blocks extreme back-to-back plays', () => {
    let now = 1000;
    const limiter = new AudioFeedbackRateLimiter(12, 12, () => now);
    expect(limiter.tryConsumeWhoosh()).toBe(true);
    expect(limiter.tryConsumeWhoosh()).toBe(false);
    now = 1011;
    expect(limiter.tryConsumeWhoosh()).toBe(false);
    now = 1012;
    expect(limiter.tryConsumeWhoosh()).toBe(true);
  });

  it('tracks whoosh and click cool-downs independently', () => {
    let now = 0;
    const limiter = new AudioFeedbackRateLimiter(20, 10, () => now);
    expect(limiter.tryConsumeWhoosh()).toBe(true);
    expect(limiter.tryConsumeClick()).toBe(true);
    now = 9;
    expect(limiter.tryConsumeWhoosh()).toBe(false);
    expect(limiter.tryConsumeClick()).toBe(false);
    now = 10;
    expect(limiter.tryConsumeClick()).toBe(true);
    expect(limiter.tryConsumeWhoosh()).toBe(false);
    now = 20;
    expect(limiter.tryConsumeWhoosh()).toBe(true);
  });

  it('reset clears cool-downs so the next play is allowed immediately', () => {
    let now = 0;
    const limiter = new AudioFeedbackRateLimiter(200, 200, () => now);
    expect(limiter.tryConsumeWhoosh()).toBe(true);
    limiter.reset();
    expect(limiter.tryConsumeWhoosh()).toBe(true);
  });
});
