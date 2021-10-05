import React, {
  useContext,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
  useImperativeHandle,
} from 'react';
import * as Tone from 'tone';
import { EventEmitter } from 'events';

import { FeedbackDelayOptions, ReverbOptions } from './toneMissingTypes';

const RackTargetContext = React.createContext<Tone.InputNode>(Tone.Destination);

function useRackConnection(node?: Tone.ToneAudioNode | null, prop?: string) {
  const target = useContext(RackTargetContext);
  const firstPropRef = useRef(prop); // avoid re-triggering on change

  useEffect(() => {
    // ignore if nothing to do
    if (!node) {
      return;
    }

    if (!target) {
      throw new Error('no output to connect to');
    }

    // use either node itself or some specific property of it
    const propName = firstPropRef.current;
    const output = propName
      ? (target as unknown as Record<string, unknown>)[propName]
      : target;

    if (!(output instanceof Tone.ToneAudioNode)) {
      if (propName) {
        throw new Error('cannot connect to audio node property: ' + propName);
      } else {
        throw new Error('target not instanceof node');
      }
    }

    // setup/cleanup logic
    node.connect(output);
    return () => {
      node.disconnect(output);
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
  const channel = useMemo(() => new Tone.Channel({ channelCount: 2 }), []);
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

/**
 * Recursive Partial taken from ToneJS (originally from here: https://stackoverflow.com/a/51365037)
 */
export declare type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<RecursivePartial<U>>
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

type RackableClass<NodeOptions, ResultType> = {
  new (options?: NodeOptions): ResultType;
};

function useRackableNode<
  NodeOptions,
  ResultType extends Tone.ToneAudioNode = Tone.ToneAudioNode
>(
  nodeClass: RackableClass<NodeOptions, ResultType>,
  props: React.PropsWithChildren<NodeOptions>,
  innerRef: React.ForwardedRef<ResultType>
) {
  const firstParamsRef = useRef(props);
  const node = useMemo(() => new nodeClass(firstParamsRef.current), []);

  useImperativeHandle(innerRef, () => node);

  return node;
}

type RackableProps<NodeOptions> = NodeOptions & {
  connect?: string;
};

function createRackable<
  NodeOptions,
  ResultType extends Tone.ToneAudioNode = Tone.ToneAudioNode
>(nodeClass: RackableClass<NodeOptions, ResultType>) {
  const componentFunc: React.ForwardRefRenderFunction<
    ResultType,
    React.PropsWithChildren<RackableProps<NodeOptions>>
  > = (props, innerRef) => {
    const node = useRackableNode(nodeClass, props, innerRef);

    // connect/disconnect the node to parent
    useRackConnection(node, props.connect);

    return (
      <RackTargetContext.Provider value={node}>
        {props.children}
      </RackTargetContext.Provider>
    );
  };

  return React.forwardRef(componentFunc);
}

interface SourceLike extends Tone.ToneAudioNode {
  start: (time?: number) => void;
  stop: () => void;
  sync: () => void;
  unsync: () => void;
}

// nodes synced to transport for start/stop and BPM @todo rename from "source"?
function createRackableSource<
  NodeOptions,
  ResultType extends SourceLike = SourceLike
>(nodeClass: RackableClass<NodeOptions, ResultType>) {
  const componentFunc: React.ForwardRefRenderFunction<
    ResultType,
    React.PropsWithChildren<RackableProps<NodeOptions>>
  > = (props, innerRef) => {
    const node = useRackableNode(nodeClass, props, innerRef);

    // @todo remove
    useEffect(() => {
      node.sync();
      node.start(0); // after syncing, schedule to start

      return () => {
        node.unsync();
        node.stop(); // immediately stop
      };
    }, [node]);

    // connect/disconnect the node to parent
    useRackConnection(node, props.connect);

    return (
      <RackTargetContext.Provider value={node}>
        {props.children}
      </RackTargetContext.Provider>
    );
  };

  return React.forwardRef(componentFunc);
}

const GLOBAL_TRANSPORT_EVENTS = new EventEmitter();
interface TransportNoteEvent {
  time: number;
  value: unknown;
}

type RackableInstrumentProps<NodeOptions> = RackableProps<NodeOptions> & {
  notes?: string;
  duration?: string | number;
  velocity?: number;
};

function parseEventDuration<DefaultType>(
  val: unknown,
  defaultValue: DefaultType
) {
  switch (typeof val) {
    case 'number':
      return val;
    case 'string':
      return val;
    default:
      return defaultValue; // @todo report
  }
}

function parseEventVelocity<DefaultType>(
  val: unknown,
  defaultValue: DefaultType
) {
  switch (typeof val) {
    case 'number':
      return val;
    default:
      return defaultValue; // @todo report
  }
}

interface InstrumentLike extends Tone.ToneAudioNode {
  // expect a call signature similar to e.g. synth
  triggerAttackRelease: (
    ...params: Parameters<Tone.Synth['triggerAttackRelease']>
  ) => void;

  // also need to sync BPM for duration values
  sync: () => void;
  unsync: () => void;
}

export function createRackableInstrument<
  NodeOptions,
  ResultType extends InstrumentLike = InstrumentLike
>(nodeClass: RackableClass<NodeOptions, ResultType>) {
  const componentFunc: React.ForwardRefRenderFunction<
    ResultType,
    React.PropsWithChildren<RackableInstrumentProps<NodeOptions>>
  > = (props, innerRef) => {
    const instrNode = useRackableNode(nodeClass, props, innerRef);

    // connect/disconnect the node to parent
    useRackConnection(instrNode, props.connect);

    const firstNoteTopicRef = useRef(props.notes);

    const durationRef = useRef(props.duration);
    durationRef.current = props.duration;
    const velocityRef = useRef(props.velocity);
    velocityRef.current = props.velocity;

    // listen for note events coming down from the transport
    useEffect(() => {
      const noteTopic = firstNoteTopicRef.current;
      const noteListener = ({ time, value }: TransportNoteEvent) => {
        if (time === undefined) {
          return;
        }

        if (typeof value === 'string') {
          // simple string notes, use prop-configured duration/velocity
          instrNode.triggerAttackRelease(
            value,
            durationRef.current || 0.1, // @todo report?
            time,
            velocityRef.current
          );
        } else if (typeof value === 'object' && value) {
          // object notes, use specified values or fall back to prop-configured
          // duration/velocity for unspecified ones
          const { note, duration, velocity } = value as Record<string, unknown>;
          instrNode.triggerAttackRelease(
            String(note), // @todo better
            duration === undefined
              ? durationRef.current || 0.1 // @todo report
              : parseEventDuration(duration, 0.1),
            time,
            velocity === undefined
              ? velocityRef.current
              : parseEventVelocity(velocity, undefined)
          );
        }
      };

      // listen for notes and sync with timeline
      GLOBAL_TRANSPORT_EVENTS.on(`note:${noteTopic}`, noteListener);
      instrNode.sync();

      return () => {
        // unsync and stop listening for notes
        instrNode.unsync();
        GLOBAL_TRANSPORT_EVENTS.off(`note:${noteTopic}`, noteListener);
      };
    }, [instrNode]);

    return (
      <RackTargetContext.Provider value={instrNode}>
        {props.children}
      </RackTargetContext.Provider>
    );
  };

  return React.forwardRef(componentFunc);
}

function useNoteEmitter(noteTopic: string) {
  return useCallback(
    (time: number, value: unknown) => {
      GLOBAL_TRANSPORT_EVENTS.emit(`note:${noteTopic}`, {
        time,
        value,
      });
    },
    [noteTopic]
  );
}

const RDistortion = createRackable<
  Partial<Tone.DistortionOptions>,
  Tone.Distortion
>(Tone.Distortion);
const RFeedbackDelay = createRackable<Partial<FeedbackDelayOptions>>(
  Tone.FeedbackDelay
);
const RFilter = createRackable<Partial<Tone.FilterOptions>>(Tone.Filter);
const RLFO = createRackableSource<Partial<Tone.LFOOptions>, Tone.LFO>(Tone.LFO);
const RMonoSynth = createRackableInstrument<
  RecursivePartial<Tone.MonoSynthOptions>
>(Tone.MonoSynth);
const RReverb = createRackable<Partial<ReverbOptions>>(Tone.Reverb);
const RPolySynth = createRackableInstrument<
  Partial<Tone.PolySynthOptions<Tone.MonoSynth>>
>(Tone.PolySynth);

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
  const [started, setStarted] = useState(false);
  return (
    <>
      {started ? <OrigSketch /> : null}

      <div>
        <button
          type="button"
          onClick={() => {
            Tone.start().then(() => {
              setStarted(true);

              // start main timeline after everything renders
              Tone.Transport.start('+0.1');
            });
          }}
        >
          Start
        </button>
      </div>
    </>
  );
};
