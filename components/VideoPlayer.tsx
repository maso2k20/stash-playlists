import VideoJS from 'react-video-js-player';

export function VideoPlayer({ url, start, end, onEnded }) {
  const playerRef = useRef(null);
  const handleTimeUpdate = () => {
    if (playerRef.current && playerRef.current.getCurrentTime() >= end) {
      playerRef.current.pause();
      onEnded?.();
    }
  };
  return (
    <VideoJS
      ref={playerRef}
      src={url}
      onTimeUpdate={handleTimeUpdate}
      controls
      autoplay
      onReady={player => player.currentTime(start)}
    />
  );
}
