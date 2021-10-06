import React from 'react';
import { AppProps } from 'next/app';

import { RackUIContainer } from '../rackUI';

import 'tailwindcss/tailwind.css';
import '../index.css';

const MyApp: React.FC<AppProps> = ({ Component, pageProps }) => {
  return (
    <RackUIContainer>
      <Component {...pageProps} />
    </RackUIContainer>
  );
};

// // render after resources are ready
// WebFont.load({
//   google: {
//     families: []
//   },

//   active: function() {
//     ReactDOM.render(React.createElement(App), document.getElementById('root'));
//   }
// });

export default MyApp;
