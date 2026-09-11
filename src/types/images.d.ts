declare module '*.jpg' {
  const source: import('react-native').ImageRequireSource;
  export default source;
}

declare module '*.png' {
  const source: import('react-native').ImageRequireSource;
  export default source;
}

declare module '*.webp' {
  const source: import('react-native').ImageRequireSource;
  export default source;
}

declare module '*.mp3' {
  const source: number;
  export default source;
}

declare module '*.wav' {
  const source: number;
  export default source;
}
