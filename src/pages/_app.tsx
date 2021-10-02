import React from 'react';
import { AppProps } from 'next/app';

import '../index.css';

const MyApp: React.FC<AppProps> = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
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
