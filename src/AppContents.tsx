import React, { useContext, useEffect, useRef, useMemo, useState } from 'react';
import * as Tone from 'tone';

type GenericInstrumentTriggerFunc = (
  ...params: Parameters<Tone.Synth['triggerAttackRelease']>
) => void;

type InstrumentLike = {
  triggerAttackRelease: GenericInstrumentTriggerFunc;
};

const RackTargetContext = React.createContext<Tone.InputNode | null>(null);

function useRackConnection(node?: Tone.ToneAudioNode | null) {
  const target = useContext(RackTargetContext);

  useEffect(() => {
    // ignore if nothing to do
    if (!node) {
      return;
    }

    if (!target) {
      throw new Error('no output to connect to');
    }

    // setup/cleanup logic
    node.connect(target);
    return () => {
      node.disconnect(target);
    };
  }, [node, target]);
}

// pipe straight to the global audio output
export const RackDestination: React.FC = ({ children }) => {
  return (
    <RackTargetContext.Provider value={Tone.Destination}>
      {children}
    </RackTargetContext.Provider>
  );
};

export const RackChannel: React.FC<{ send?: string; receive?: string }> = ({
  send,
  receive,
  children,
}) => {
  const channel = useMemo(() => new Tone.Channel(), []);
  const sendModeRef = useRef(false);
  const receiveModeRef = useRef(false);

  // output to parent unless sending elsewhere (or have done so in the past)
  useRackConnection(send || sendModeRef.current ? null : channel);

  useEffect(() => {
    // safety check if trying to re-send again somewhere/disconnect
    if (sendModeRef.current) {
      console.error('channel was sending output elsewhere, cannot reuse it');
    }

    if (send === undefined) {
      return;
    }

    sendModeRef.current = true;
    channel.send(send);

    return () => {
      // disconnect all audio as cleanup, in case someone still tries to re-send elsewhere
      // (it won't work but at least might as well silence this output)
      // @todo just set vol to 0?
      channel.disconnect();
    };
  }, [send]);

  useEffect(() => {
    // safety check if trying to re-receive again from somewhere/disconnect
    if (receiveModeRef.current) {
      console.error(
        'channel was receiving output from elsewhere, cannot disconnect it'
      );
    }

    if (receive === undefined) {
      return;
    }

    receiveModeRef.current = true;
    channel.receive(receive);

    return () => {
      // disconnect all audio as cleanup, in case someone still tries to re-receive elsewhere
      // (it won't work but at least might as well silence this output)
      // @todo just set vol to 0?
      channel.disconnect();
    };
  }, [receive]);

  return (
    <RackTargetContext.Provider value={channel}>
      {children}
    </RackTargetContext.Provider>
  );
};

type FilteredKeys<T, U> = { [P in keyof T]: T[P] extends U ? T[P] : never };
type ReverbParams = FilteredKeys<Tone.Reverb, Tone.Signal<any>>;

function Rack<
  NodeClass extends Tone.ToneAudioNode<NodeOptions>,
  NodeOptions extends Tone.ToneAudioNodeOptions
>({
  type,
  params,
  children,
}: React.PropsWithChildren<{
  type: { new (options?: Partial<NodeOptions>): NodeClass };
  params?: Partial<NodeOptions>;
}>) {
  const firstTypeRef = useRef(type);
  const firstParamsRef = useRef(params);

  const node = useMemo(() => {
    return new firstTypeRef.current(firstParamsRef.current);
  }, []);

  // always clean up on unmount
  useEffect(() => {
    return () => {
      node.disconnect();
    };
  }, [node]);

  useRackConnection(node);

  return (
    <RackTargetContext.Provider value={node}>
      {children}
    </RackTargetContext.Provider>
  );
}

const Ambience: React.FC = ({ children }) => {
  return (
    <>
      <RackChannel send="ambienceIn">{children}</RackChannel>
      <Rack type={Tone.Reverb}>
        <RackChannel receive="ambienceIn" />
      </Rack>
      <Rack type={Tone.Reverb}>
        <Rack type={Tone.FeedbackDelay}>
          <RackChannel receive="ambienceIn" />
        </Rack>
        <Rack type={Tone.FeedbackDelay}>
          <RackChannel receive="ambienceIn" />
        </Rack>
      </Rack>
    </>
  );
};

const TestOsc: React.FC = () => {
  const noise = useMemo(() => {
    const node = new Tone.Noise('pink');
    node.volume.value = -10;
    node.start();
    return node;
  }, []);

  useRackConnection(noise);

  return null;
};

const TestMain: React.FC = () => {
  return (
    <RackDestination>
      <Rack
        type={Tone.Filter}
        params={{
          type: 'bandpass',
          frequency: 'C2',
          Q: 0.5,
        }}
      >
        <TestOsc />
      </Rack>
    </RackDestination>
  );
};

export const OrigSketch: React.FC = () => {
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
    const lfo = new Tone.LFO('13m', 300, 2200).connect(filter.frequency);

    const synthOut = new Tone.Channel({ channelCount: 2 }); // must specify # of channels per ToneJS#941
    synth.chain(dist, filter, synthOut);
    // synth.chain(chorus, Tone.Destination);

    synthOut.send('synth');

    const ambienceIn = new Tone.Channel({ channelCount: 2 });
    const ambienceOut = new Tone.Channel({ channelCount: 2 });

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
    ambienceIn.chain(rev, ambienceOut);

    const rev2 = new Tone.Reverb({ decay: 4, preDelay: 0.01, wet: 0.45 });
    ambienceIn.chain(delay, delayFilter, rev2);
    ambienceIn.chain(delay2, delay2Filter, rev2);
    rev2.chain(ambienceOut);

    ambienceIn.receive('synth');
    ambienceOut.connect(Tone.Destination);

    function chord(
      instr: InstrumentLike,
      noteString: string,
      duration: number | string,
      time: number
    ) {
      for (const note of noteString.split(/\s+/g)) {
        instr.triggerAttackRelease(note, duration, time);
      }
    }

    Tone.Transport.scheduleRepeat((time) => {
      chord(synth, 'C2 E2 G2 B2', '8n', time);
      chord(synth, 'C2 E2 G2 B2', '8n', time + Tone.Time('0:1').toSeconds());

      chord(synth, 'F2 A2 C3 E3', '8n', time + Tone.Time('1:2:2').toSeconds());
      chord(synth, 'F2 A2 C3 E3', '8n', time + Tone.Time('1:3:2').toSeconds());
    }, '2m');

    lfo.start();

    // Tone.Transport.scheduleRepeat((time) => {
    //   chord(synth, "C3 E3 G3 B3", "8n", time);
    //   chord(synth, "C3 E3 G3 B3", "8n", time + Tone.Time("4n"));
    //   chord(synth, "F3 A3 C4 E4", "8n", time + Tone.Time("1t"));
    // }, "1m");
  }, []);

  return null;
};

export const AppContents: React.FC = () => {
  const [started, setStarted] = useState(false);
  return (
    <>
      {started ? <TestMain /> : null}

      <div>
        <button
          type="button"
          onClick={() => {
            Tone.start().then(() => {
              Tone.Transport.start();
              setStarted(true);
            });
          }}
        >
          Start
        </button>
      </div>
    </>
  );
};
