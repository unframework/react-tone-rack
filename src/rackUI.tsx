import React, { useState, useMemo, useContext, useEffect } from 'react';
import * as Tone from 'tone';

const cellPlaceholders = [...new Array(8 * 8)].map((_, i) => (
  <div
    key={i}
    className="flex justify-center items-center border border-gray-500 border-dotted text-gray-500 text-xl opacity-20 relative"
    style={{
      zIndex: -1,
      gridColumnStart: (i % 8) + 1,
      gridRowStart: Math.floor(i / 8) + 1,
    }}
  >
    {(i % 8) + 1},{Math.floor(i / 8) + 1}
  </div>
));

const UIContext = React.createContext<{
  setStarted: (on: boolean) => void;
} | null>(null);

export const RackUIContainer: React.FC = ({ children }) => {
  const [isStarted, setStarted] = useState(false);
  const ctx = useMemo(() => {
    return {
      setStarted,
    };
  }, []);

  useEffect(() => {
    // start only once
    if (isStarted) {
      Tone.start().then(() => {
        console.log('starting');
        // start main timeline after everything renders
        Tone.Transport.start('+0.1');
      });
    }
  }, [isStarted]);

  return (
    <UIContext.Provider value={ctx}>
      <div className="grid grid-cols-8 grid-rows-8 gap-1 w-full h-full relative">
        {cellPlaceholders}

        <RackUIStartButton />

        {isStarted ? children : null}
      </div>
    </UIContext.Provider>
  );
};

export const RackUIStartButton: React.FC = ({ children }) => {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error('need rack UI context');
  }

  const { setStarted } = ctx;

  return (
    <div className="col-start-1 row-start-1 flex items-center justify-center">
      <button
        type="button"
        className="px-4 py-3 border-2 border-dotted border-green-800 bg-black text-white font-medium rounded-md hover:bg-green-600 hover:text-black hover:border-green-600"
        onClick={() => {
          setStarted(true);
        }}
      >
        Start
      </button>
    </div>
  );
};
