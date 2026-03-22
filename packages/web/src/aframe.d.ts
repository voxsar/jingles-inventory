/* eslint-disable */
// A-Frame module declaration (no official @types/aframe package for v1.7)
declare module 'aframe';

// A-Frame custom HTML elements for JSX usage
declare namespace JSX {
  interface IntrinsicElements {
    'a-scene': any;
    'a-entity': any;
    'a-camera': any;
    'a-sky': any;
    'a-plane': any;
    'a-box': any;
    'a-sphere': any;
    'a-cylinder': any;
    'a-cone': any;
    'a-text': any;
    'a-light': any;
    'a-image': any;
    'a-circle': any;
    'a-ring': any;
    'a-cursor': any;
    'a-assets': any;
  }
}
