import React from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import videojsOffset from 'videojs-offset';
import vttThumbnails from 'videojs-vtt-thumbnails';
import 'videojs-vtt-thumbnails/dist/videojs-vtt-thumbnails.css';
import './vtt-thumbnails.css';
import { processVttFile, cleanupVttBlob } from '../../lib/vttProcessor';

videojs.registerPlugin('offset', videojsOffset);
videojs.registerPlugin('vttThumbnails', vttThumbnails);

export const VideoJS = (props) => {
  const videoRef = React.useRef(null);
  const playerRef = React.useRef(null);
  const vttBlobRef = React.useRef(null);
  const { options, onReady, offset, vttPath, stashServer, stashAPI } = props;

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
        
        // Initialize VTT thumbnails if VTT path is provided
        if (vttPath && stashServer && stashAPI) {
          processVttFile(vttPath, stashServer, stashAPI)
            .then((vttBlobUrl) => {
              if (vttBlobUrl) {
                vttBlobRef.current = vttBlobUrl;
                player.vttThumbnails({
                  src: vttBlobUrl,
                  showTimestamp: true,
                  responsive: true,
                  width: 160,
                  height: 90
                });
              }
            })
            .catch((error) => {
              console.error('Failed to initialize VTT thumbnails:', error);
            });
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
    const vttBlobUrl = vttBlobRef.current;
    return () => {
      // Clean up VTT blob URL to prevent memory leaks
      if (vttBlobUrl) {
        cleanupVttBlob(vttBlobUrl);
        vttBlobRef.current = null;
      }
      
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