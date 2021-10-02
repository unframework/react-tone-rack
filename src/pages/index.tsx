import React, { useRef } from 'react';
import dynamic from 'next/dynamic';

const Contents = dynamic(
  async () => (await import('../AppContents')).AppContents,
  {
    ssr: false,
  }
);

const App: React.FC = () => {
  return <Contents />;
};

export default App;
