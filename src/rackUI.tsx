import React from 'react';

const cellPlaceholders = [...new Array(8 * 8)].map((_, i) => (
  <div className="flex justify-center items-center border border-gray-500 border-dotted text-gray-500 text-xl opacity-20">
    {(i % 8) + 1},{Math.floor(i / 8) + 1}
  </div>
));

export const RackUIContainer: React.FC = ({ children }) => {
  return (
    <div className="grid grid-cols-8 grid-rows-8 gap-1 w-full h-full">
      {cellPlaceholders}

      {children}
    </div>
  );
};
