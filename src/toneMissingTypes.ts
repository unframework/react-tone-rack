import { Time, Seconds } from 'tone/build/esm/core/type/Units';
import { FeedbackEffectOptions } from 'tone/build/esm/effect/FeedbackEffect';
import { EffectOptions } from 'tone/build/esm/effect/Effect';

// add missing exports for certain e.g. option interfaces
// @todo sort out module declaration merging
// @todo report upstream
export interface FeedbackDelayOptions extends FeedbackEffectOptions {
  delayTime: Time;
  maxDelay: Time;
}

export interface ReverbOptions extends EffectOptions {
  decay: Seconds;
  preDelay: Seconds;
}
