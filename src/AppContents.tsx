import React, { useEffect, useRef } from 'react';
import * as Tone from 'tone';

export const AppContents: React.FC = () => {
  const lfoRef = useRef();

  useEffect(() => {
    const synth = new Tone.PolySynth(Tone.MonoSynth, {
      volume: -20,
      oscillator: {
        type: 'fatsawtooth',
        count: 3,
        spread: 10,
      },
      envelope: {
        attack: 0.05,
        decay: 0.4,
        sustain: 0.4,
        release: 0.1,
      },
      filter: {
        type: 'bandpass',
        Q: 1.8,
      },
      filterEnvelope: {
        baseFrequency: 'C3',
        octaves: 4,
        attack: 0.01,
        decay: 0.3,
        sustain: 0,
        release: 0.2,
      },
    });

    const dist = new Tone.Distortion(0.75);
    dist.wet.value = 0.3;

    const filter = new Tone.Filter({ type: 'lowpass', Q: 12 });
    lfoRef.current = new Tone.LFO('13m', 300, 2200).connect(filter.frequency);

    const delay = new Tone.FeedbackDelay('4t', 0.65);
    const delayFilter = new Tone.Filter({
      type: 'bandpass',
      frequency: 'C7',
      Q: 2,
    });

    const delay2 = new Tone.FeedbackDelay('3t', 0.75);
    const delay2Filter = new Tone.Filter({
      type: 'bandpass',
      frequency: 'C8',
      Q: 2,
    });

    const rev = new Tone.Reverb({ decay: 12, preDelay: 0.01, wet: 0.35 });

    const rev2 = new Tone.Reverb({ decay: 4, preDelay: 0.01, wet: 0.45 });

    // synth.chain(chorus, Tone.Destination);
    synth.chain(dist, filter, rev);
    filter.chain(delay, delayFilter, rev2);
    filter.chain(delay2, delay2Filter, rev2);
    rev.chain(Tone.Destination);
    rev2.chain(Tone.Destination);

    function chord(instr, noteString, duration, time) {
      for (const note of noteString.split(/\s+/g)) {
        instr.triggerAttackRelease(note, duration, time);
      }
    }

    Tone.Transport.scheduleRepeat((time) => {
      chord(synth, 'C2 E2 G2 B2', '8n', time);
      chord(synth, 'C2 E2 G2 B2', '8n', time + Tone.Time('0:1'));

      chord(synth, 'F2 A2 C3 E3', '8n', time + Tone.Time('1:2:2'));
      chord(synth, 'F2 A2 C3 E3', '8n', time + Tone.Time('1:3:2'));
    }, '2m');

    // Tone.Transport.scheduleRepeat((time) => {
    //   chord(synth, "C3 E3 G3 B3", "8n", time);
    //   chord(synth, "C3 E3 G3 B3", "8n", time + Tone.Time("4n"));
    //   chord(synth, "F3 A3 C4 E4", "8n", time + Tone.Time("1t"));
    // }, "1m");
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          Tone.start().then(() => {
            lfoRef.current.start();
            Tone.Transport.start();
          });
        }}
      >
        Start
      </button>
    </div>
  );
};
