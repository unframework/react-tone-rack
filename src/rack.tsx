import React, {
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
} from 'react';
import * as Tone from 'tone';
import { EventEmitter } from 'events';

import { FeedbackDelayOptions, ReverbOptions } from './toneMissingTypes';

// internal
export const RackTargetContext = React.createContext<Tone.InputNode>(
  Tone.Destination
);

// internal
export function useRackConnection(
  node?: Tone.ToneAudioNode | null,
  prop?: string
) {
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
export const RackDestination: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  return (
    <RackTargetContext.Provider value={Tone.Destination}>
      {children}
    </RackTargetContext.Provider>
  );
};

export const RackChannel: React.FC<
  React.PropsWithChildren<{ send?: string; receive?: string }>
> = ({ send, receive, children }) => {
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

// internal
type RackableClass<NodeOptions, ResultType> = {
  new (options?: NodeOptions): ResultType;
  getDefaults(): NodeOptions;
};

// internal
export function useRackableNode<
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

export type RackableProps<NodeOptions> = NodeOptions & {
  connect?: string;
};

// internal
export function createRackable<
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

export interface SourceLike extends Tone.ToneAudioNode {
  start: (time?: number) => void;
  stop: () => void;
  sync: () => void;
  unsync: () => void;
}

// internal
// nodes synced to transport for start/stop and BPM @todo rename from "source"?
export function createRackableSource<
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

// @todo instead of one emitter use a topic map - emitters are not meant to have many listeners
const GLOBAL_TRANSPORT_EVENTS = new EventEmitter();
interface TransportNoteEvent {
  time: number;
  value: unknown;
}

export type RackableInstrumentProps<NodeOptions> =
  RackableProps<NodeOptions> & {
    notes?: string;
    duration?: string | number;
    velocity?: number;
    synced?: boolean;
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

// internal
export interface InstrumentLike extends Tone.ToneAudioNode {
  // expect a call signature similar to e.g. synth
  triggerAttack: (...params: Parameters<Tone.Synth['triggerAttack']>) => void;
  triggerRelease: (...params: Parameters<Tone.Synth['triggerRelease']>) => void;
  triggerAttackRelease: (
    ...params: Parameters<Tone.Synth['triggerAttackRelease']>
  ) => void;

  // also need to sync BPM for duration values
  sync: () => void;
  unsync: () => void;
}

// internal
export function createRackableInstrument<
  NodeOptions,
  ResultType extends InstrumentLike = InstrumentLike
>(nodeClass: RackableClass<NodeOptions, ResultType>) {
  const componentFunc: React.ForwardRefRenderFunction<
    ResultType,
    React.PropsWithChildren<RackableInstrumentProps<NodeOptions>>
  > = (props, innerRef) => {
    // @todo this function runs twice? but effects run only the second time??
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
      if (!noteTopic) {
        return;
      }

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

      // listen for notes
      // (if note topic is empty this was likely created for immediate ref instead)
      GLOBAL_TRANSPORT_EVENTS.on(`note:${noteTopic}`, noteListener);
      return () => {
        GLOBAL_TRANSPORT_EVENTS.off(`note:${noteTopic}`, noteListener);
      };
    }, [instrNode]);

    // sync to transport if needed
    useEffect(() => {
      if (props.synced) {
        instrNode.sync();
        return () => {
          instrNode.unsync();
        };
      }
    }, [instrNode, props.synced]);

    return (
      <RackTargetContext.Provider value={instrNode}>
        {props.children}
      </RackTargetContext.Provider>
    );
  };

  return React.forwardRef(componentFunc);
}

export function useNoteEmitter(noteTopic: string) {
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

export const RDistortion = createRackable<
  Partial<Tone.DistortionOptions>,
  Tone.Distortion
>(Tone.Distortion);
export const RFeedbackDelay = createRackable<Partial<FeedbackDelayOptions>>(
  Tone.FeedbackDelay
);
export const RFilter = createRackable<Partial<Tone.FilterOptions>>(Tone.Filter);
export const RLFO = createRackableSource<Partial<Tone.LFOOptions>, Tone.LFO>(
  Tone.LFO
);
export const RMonoSynth = createRackableInstrument<
  RecursivePartial<Tone.MonoSynthOptions>
>(Tone.MonoSynth);
export const RFMSynth = createRackableInstrument<
  RecursivePartial<Tone.FMSynthOptions>
>(Tone.FMSynth);
export const RSynth = createRackableInstrument<
  RecursivePartial<Tone.SynthOptions>
>(Tone.Synth);
export const RReverb = createRackable<Partial<ReverbOptions>>(Tone.Reverb);

// any voice-specific options are in child content, so we just use a dummy voice type here
type RPSOptions = Partial<
  Omit<Tone.PolySynthOptions<Tone.Synth>, 'voice' | 'options'>
>;

interface ProxyVoiceOptions {
  onCreate: (instance: ProxyVoice) => void;
}

class ProxyVoice {
  private _output: Tone.Volume;
  private _instrumentPromise: Promise<InstrumentLike>;

  refHandler: React.RefCallback<InstrumentLike>;
  constructorOptions: {
    onsilence: (instrument: unknown) => void;
  };

  constructor(...args: any[]) {
    console.log('instantiating proxy voice');
    this._output = new Tone.Volume();

    this.refHandler = () => undefined; // stub to prevent init warning

    this._instrumentPromise = new Promise((resolve) => {
      // set up the stable ref handler callback
      this.refHandler = (instrument) => {
        // ignore ref unset
        if (instrument === null) {
          return;
        }

        console.log('got instrument', instrument);

        // initialize from ref value
        instrument.connect(this._output);

        resolve(instrument);
      };
    });

    // get the PolySynth-specific options to pass along to the constructor
    // @todo also preserve the passed-in context?
    const { onsilence } = args[0];
    this.constructorOptions = {
      onsilence,
    };

    // notify our React wrapper that a new voice instance is needed
    const options = args[0] as ProxyVoiceOptions;
    options.onCreate(this);
  }

  connect(...params: Parameters<Tone.ToneAudioNode['connect']>) {
    this._output.connect(...params);
  }

  triggerAttack(...args: Parameters<Tone.Synth['triggerAttack']>) {
    this._instrumentPromise.then((instrument) =>
      instrument.triggerAttack(...args)
    );
    return this;
  }

  triggerRelease(...args: Parameters<Tone.Synth['triggerRelease']>) {
    this._instrumentPromise.then((instrument) =>
      instrument.triggerRelease(...args)
    );
    return this;
  }

  triggerAttackRelease(
    ...args: Parameters<Tone.Synth['triggerAttackRelease']>
  ) {
    this._instrumentPromise.then((instrument) =>
      instrument.triggerAttackRelease(...args)
    );
    return this;
  }

  dispose() {
    console.log('disposing');
    this._output.dispose();
    this._instrumentPromise.then((instrument) => instrument.dispose());

    return this;
  }

  static getDefaults() {
    return Tone.Synth.getDefaults();
  }
}

export const RPolySynth2 = React.forwardRef(function (
  props: RackableInstrumentProps<RPSOptions> & {
    children: React.ReactElement;
  },
  innerRef: React.ForwardedRef<InstrumentLike>
) {
  const [proxyVoices, setProxyVoices] = useState<ProxyVoice[]>([]);

  const nodeClass: RackableClass<
    Partial<Tone.PolySynthOptions<Tone.Synth>>,
    InstrumentLike
  > = Tone.PolySynth;

  const proxyOptions: ProxyVoiceOptions = {
    onCreate(instance) {
      setProxyVoices((prev) => [...prev, instance]);
    },
  };

  const instrNode = useRackableNode(
    nodeClass,
    {
      ...props,
      voice: ProxyVoice as unknown as typeof Tone.Synth,
      options: proxyOptions as unknown as Tone.SynthOptions,
    },
    innerRef
  );

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
    if (!noteTopic) {
      return;
    }

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

    // listen for notes
    // (if note topic is empty this was likely created for immediate ref instead)
    GLOBAL_TRANSPORT_EVENTS.on(`note:${noteTopic}`, noteListener);
    return () => {
      GLOBAL_TRANSPORT_EVENTS.off(`note:${noteTopic}`, noteListener);
    };
  }, [instrNode]);

  // sync to transport if needed
  useEffect(() => {
    if (props.synced) {
      instrNode.sync();
      return () => {
        instrNode.unsync();
      };
    }
  }, [instrNode, props.synced]);

  return (
    <>
      {proxyVoices.map((instance, index) =>
        React.cloneElement(props.children, {
          key: index,
          ref: instance.refHandler,
          ...instance.constructorOptions, // @todo preserve original onsilence if any? or at least complain
        })
      )}
    </>
  );
});
