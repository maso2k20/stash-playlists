import React from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import videojsOffset from 'videojs-offset';
videojs.registerPlugin('offset', videojsOffset);

export const VideoJS = (props) => {
  const videoRef = React.useRef(null);
  const playerRef = React.useRef(null);
  const { options, onReady, offset } = props;

  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    if (!playerRef.current) {
      const videoElement = document.createElement('video-js');
      videoElement.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(videoElement);

      const player = (playerRef.current = videojs(videoElement, options, () => {
        videojs.log('player is ready');
        if (offset) {
          player.offset(offset);
        }
        if (onReady) {
          onReady(player);
        }
      }));
    } else {
      const player = playerRef.current;
      player.autoplay(options.autoplay);
      player.src(options.sources);
      if (offset) {
        player.offset(offset);
      }
      if (props.hasStarted) {
        player.play();
      }
    }
  }, [options, offset, props.hasStarted]);

  // Fade out in last 2 seconds before offset end
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player || !offset) return;

    const handleTimeUpdate = () => {
      if (player.currentTime() >= offset.end - 2) {
        setVisible(false);
      }
    };

    player.on('timeupdate', handleTimeUpdate);
    return () => {
      player.off('timeupdate', handleTimeUpdate);
    };
  }, [offset]);

  // Fade in after seeked (start of new video)
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handleSeeked = () => {
      setVisible(true);
    };

    player.on('seeked', handleSeeked);
    return () => {
      player.off('seeked', handleSeeked);
    };
  }, [options.sources]);

  // Handle ended event from parent
  React.useEffect(() => {
    const player = playerRef.current;
    if (player && props.onEnded) {
      player.on('ended', props.onEnded);
      return () => {
        player.off('ended', props.onEnded);
      };
    }
  }, [props.onEnded]);

  React.useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className='video-player'
      data-vjs-player
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 1s'
      }}
    >
      <div ref={videoRef} />
    </div>
  );
};

export default VideoJS;