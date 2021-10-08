import React, { useEffect, useState } from 'react';
import * as Tone from 'tone';

import {
  RackDestination,
  RackChannel,
  RDistortion,
  RFeedbackDelay,
  RFilter,
  RLFO,
  RMonoSynth,
  RReverb,
  RPolySynth,
  useNoteEmitter,
} from './rack';

const Ambience: React.FC = ({ children }) => {
  return (
    <>
      <RackChannel send="ambienceIn">{children}</RackChannel>

      <RReverb decay={12} preDelay={0.01} wet={0.35}>
        <RackChannel receive="ambienceIn" />
      </RReverb>

      <RReverb decay={4} preDelay={0.01} wet={0.45}>
        <RFilter type="bandpass" frequency="C7" Q={2}>
          <RFeedbackDelay delayTime="4t" feedback={0.65}>
            <RackChannel receive="ambienceIn" />
          </RFeedbackDelay>
        </RFilter>
        <RFilter type="bandpass" frequency="C8" Q={2}>
          <RFeedbackDelay delayTime="3t" feedback={0.75}>
            <RackChannel receive="ambienceIn" />
          </RFeedbackDelay>
        </RFilter>
      </RReverb>
    </>
  );
};

const TestPlayer: React.FC = () => {
  const emitNote = useNoteEmitter('testPattern');

  useEffect(() => {
    const testPattern = new Tone.Part<[string, string]>(
      (time, chord) => {
        for (const note of chord.split(/\s+/g)) {
          emitNote(time, note);
        }
      },
      [
        ['0:1', 'C2 E2 G2 B2'],
        ['0:3', 'C2 E2 G2 B2'],
        ['1:1', 'C2 E2 G2 B2'],
        // ['1:3', 'C2 E2 G2 B2'],
        ['1:3', 'F2 A2 C3 E3'],
      ]
    );
    testPattern.loop = true;
    testPattern.loopEnd = '2m';
    testPattern.start();

    // Tone.Transport.scheduleRepeat((time) => {
    //   chord(synth, "C3 E3 G3 B3", "8n", time);
    //   chord(synth, "C3 E3 G3 B3", "8n", time + Tone.Time("4n"));
    //   chord(synth, "F3 A3 C4 E4", "8n", time + Tone.Time("1t"));
    // }, "1m");

    // always clean up
    return () => {
      testPattern.stop();
      testPattern.dispose();
    };
  }, [emitNote]);

  return null;
};

const TestBassline: React.FC = () => {
  const emitNote = useNoteEmitter('bassline');

  useEffect(() => {
    const pattern = new Tone.Part<[string, string]>(
      (time, note) => {
        emitNote(time, note);
      },
      [
        ['0:0', 'C2'],
        ['0:0:2', 'E2'],
        ['0:2', 'E2'],
        ['0:2:2', 'E2'],
        ['1:0', 'E2'],
        ['1:3:2', 'E2'],
      ]
    );
    pattern.loop = true;
    pattern.loopEnd = '2m';
    pattern.start();

    // always clean up
    return () => {
      pattern.stop();
      pattern.dispose();
    };
  }, [emitNote]);

  return null;
};

const BaseSynth: React.FC = ({ children }) => {
  const rawSynth = (
    <RPolySynth
      notes="testPattern"
      duration="8n"
      voice={Tone.MonoSynth}
      volume={-20}
      options={{
        oscillator: {
          type: 'fatsawtooth',
          count: 3,
          spread: 10,
        },
        envelope: {
          attack: 0.05,
          decay: 0.2,
          sustain: 0.2,
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
      }}
    >
      {children}
    </RPolySynth>
  );

  return (
    <RFilter type="lowpass" Q={12}>
      <RLFO connect="frequency" min={300} max={2200} frequency="13m" />

      <RDistortion distortion={0.75} wet={0.3}>
        {rawSynth}
      </RDistortion>
    </RFilter>
  );
};

const OrigSketch: React.FC = () => {
  return (
    <RackDestination>
      <TestPlayer />
      <TestBassline />

      <RackChannel send="synth">
        <BaseSynth />
      </RackChannel>

      <Ambience>
        <RackChannel receive="synth" />
      </Ambience>

      <RReverb decay={5} wet={0.2}>
        <RMonoSynth
          notes="bassline"
          duration="8n"
          oscillator={{
            type: 'square',
            volume: -10,
          }}
          envelope={{
            attack: 0.03,
            decay: 0.3,
            sustain: 0.7,
            release: 0.1,
          }}
          filter={{
            type: 'lowpass',
            Q: 2,
          }}
          filterEnvelope={{
            baseFrequency: 'C3',
            octaves: 0,
            attack: 0.01,
            sustain: 1,
          }}
        />
      </RReverb>
    </RackDestination>
  );
};

export const AppContents: React.FC = () => {
  return (
    <>
      <OrigSketch />
    </>
  );
};
