import React, { useRef, useCallback } from 'react';

export function useInterceptedRef<T>(
  innerRef: React.ForwardedRef<T>
): [React.MutableRefObject<T | null>, (node: T | null) => void] {
  const ourRef = useRef<T | null>(null);

  const innerRefWrapper = useCallback(
    (node: T | null) => {
      // stash for our own purposes
      ourRef.current = node;

      // report to forwarded ref
      if (innerRef) {
        if (typeof innerRef === 'function') {
          innerRef(node);
        } else {
          innerRef.current = node;
        }
      }
    },
    [innerRef]
  );

  return [ourRef, innerRefWrapper];
}
