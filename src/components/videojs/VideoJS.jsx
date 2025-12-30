import React from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import videojsOffset from 'videojs-offset';
import vttThumbnails from 'videojs-vtt-thumbnails';
import 'videojs-vtt-thumbnails/dist/videojs-vtt-thumbnails.css';
import './vtt-thumbnails.css';
import './custom-markers.css';
import './custom-controls.css';
import { processVttFile, cleanupVttBlob } from '../../lib/vttProcessor';
import { Forward30Button, Backward30Button } from './CustomControls';

videojs.registerPlugin('offset', videojsOffset);
videojs.registerPlugin('vttThumbnails', vttThumbnails);

// Simple custom markers implementation
const addCustomMarkers = (player, markers) => {
  if (!player || !markers || markers.length === 0) return;
  
  // Wait for player to be ready
  player.ready(() => {
    // Remove existing markers and tooltips
    const existingMarkers = player.el().querySelectorAll('.custom-video-marker, .custom-video-marker-range, .custom-video-marker-tooltip');
    existingMarkers.forEach(marker => marker.remove());
    
    // Get progress bar container
    const progressControl = player.controlBar.progressControl;
    if (!progressControl) return;
    
    const seekBar = progressControl.seekBar;
    if (!seekBar) return;
    
    const duration = player.duration();
    if (!duration || !isFinite(duration)) {
      // If duration not available yet, try again later
      player.one('durationchange', () => addCustomMarkers(player, markers));
      return;
    }
    
    markers.forEach((marker, index) => {
      const markerTime = marker.time;
      const markerDuration = marker.duration || 0;
      const percentage = (markerTime / duration) * 100;
      const isActive = marker.isActive || false;
      
      // Create marker element
      const markerEl = document.createElement('div');
      markerEl.className = `custom-video-marker ${isActive ? 'active' : ''}`;
      markerEl.setAttribute('data-marker-id', marker.id || '');
      markerEl.style.position = 'absolute';
      markerEl.style.left = percentage + '%';
      markerEl.style.top = '0';
      markerEl.style.bottom = '0';
      markerEl.style.width = isActive ? '5px' : '3px';
      markerEl.style.backgroundColor = isActive ? '#42A5F5' : '#2196F3';
      markerEl.style.zIndex = isActive ? '1001' : '1000';
      markerEl.style.cursor = 'default';
      markerEl.style.borderRadius = '2px';
      markerEl.style.transition = 'all 0.2s ease';
      
      // Add subtle glow effect for active marker
      if (isActive) {
        markerEl.style.boxShadow = '0 0 8px rgba(66, 165, 245, 0.8)';
      }
      
      // Create custom tooltip
      const tooltipEl = document.createElement('div');
      tooltipEl.className = 'custom-video-marker-tooltip';
      tooltipEl.textContent = marker.text || 'Marker';
      tooltipEl.style.position = 'absolute';
      tooltipEl.style.bottom = '25px';
      tooltipEl.style.left = '50%';
      tooltipEl.style.transform = 'translateX(-50%)';
      tooltipEl.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      tooltipEl.style.color = 'white';
      tooltipEl.style.padding = '4px 8px';
      tooltipEl.style.borderRadius = '4px';
      tooltipEl.style.fontSize = '12px';
      tooltipEl.style.whiteSpace = 'nowrap';
      tooltipEl.style.zIndex = '1001';
      tooltipEl.style.opacity = '0';
      tooltipEl.style.transition = 'opacity 0.2s ease';
      tooltipEl.style.pointerEvents = 'none';
      
      markerEl.appendChild(tooltipEl);
      
      // Show/hide tooltip on hover
      markerEl.addEventListener('mouseenter', () => {
        tooltipEl.style.opacity = '1';
      });
      
      markerEl.addEventListener('mouseleave', () => {
        tooltipEl.style.opacity = '0';
      });
      
      // Add duration indicator if present
      if (markerDuration > 0) {
        const endPercentage = ((markerTime + markerDuration) / duration) * 100;
        const widthPercentage = Math.max(0.5, endPercentage - percentage); // Minimum width
        
        const rangeEl = document.createElement('div');
        rangeEl.className = `custom-video-marker-range ${isActive ? 'active' : ''}`;
        rangeEl.setAttribute('data-marker-id', marker.id || '');
        rangeEl.style.position = 'absolute';
        rangeEl.style.left = percentage + '%';
        rangeEl.style.top = '0';
        rangeEl.style.bottom = '0';
        rangeEl.style.width = widthPercentage + '%';
        rangeEl.style.backgroundColor = isActive ? 'rgba(66, 165, 245, 0.3)' : 'rgba(33, 150, 243, 0.4)';
        rangeEl.style.zIndex = isActive ? '999' : '998';
        rangeEl.style.borderRadius = '2px';
        rangeEl.style.border = isActive ? '1px solid rgba(66, 165, 245, 0.8)' : '1px solid rgba(33, 150, 243, 0.6)';
        rangeEl.style.cursor = 'default';
        rangeEl.style.transition = 'all 0.2s ease';
        
        // Create tooltip for range
        const rangeTooltipEl = document.createElement('div');
        rangeTooltipEl.className = 'custom-video-marker-tooltip';
        rangeTooltipEl.textContent = marker.text || 'Marker';
        rangeTooltipEl.style.position = 'absolute';
        rangeTooltipEl.style.bottom = '25px';
        rangeTooltipEl.style.left = '50%';
        rangeTooltipEl.style.transform = 'translateX(-50%)';
        rangeTooltipEl.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        rangeTooltipEl.style.color = 'white';
        rangeTooltipEl.style.padding = '4px 8px';
        rangeTooltipEl.style.borderRadius = '4px';
        rangeTooltipEl.style.fontSize = '12px';
        rangeTooltipEl.style.whiteSpace = 'nowrap';
        rangeTooltipEl.style.zIndex = '1001';
        rangeTooltipEl.style.opacity = '0';
        rangeTooltipEl.style.transition = 'opacity 0.2s ease';
        rangeTooltipEl.style.pointerEvents = 'none';
        
        rangeEl.appendChild(rangeTooltipEl);
        
        // Show/hide tooltip on hover
        rangeEl.addEventListener('mouseenter', () => {
          rangeTooltipEl.style.opacity = '1';
        });
        
        rangeEl.addEventListener('mouseleave', () => {
          rangeTooltipEl.style.opacity = '0';
        });
        
        // Remove click handler - let normal timeline seeking work
        
        seekBar.el().appendChild(rangeEl);
      }
      
      // Remove click handler - let normal timeline seeking work
      
      // Add to seekbar
      seekBar.el().appendChild(markerEl);
    });
  });
};

export const VideoJS = (props) => {
  const videoRef = React.useRef(null);
  const playerRef = React.useRef(null);
  const vttBlobRef = React.useRef(null);
  const wasFullscreenRef = React.useRef(false);
  const { options, onReady, offset, vttPath, stashServer, stashAPI, markers, wallMode } = props;

  const [visible, setVisible] = React.useState(true);

  // Stable reference for source URL to prevent unnecessary reloads
  const sourceUrl = options?.sources?.[0]?.src;
  const offsetStart = offset?.start;
  const offsetEnd = offset?.end;

  React.useEffect(() => {
    if (!playerRef.current) {
      const videoElement = document.createElement('video-js');
      videoElement.classList.add('vjs-big-play-centered');
      videoRef.current.appendChild(videoElement);

      const playerOptions = {
        ...options,
        autoplay: false, // Disable initial autoplay to ensure offset is applied first
        userActions: {
          ...options?.userActions,
          doubleClick: false,
          // Disable built-in hotkeys to prevent interference with page inputs
          hotkeys: false
        }
      };

      const player = (playerRef.current = videojs(videoElement, playerOptions, () => {
        videojs.log('player is ready');
        if (offset) {
          player.offset(offset);
        }

        // Prevent the video element from stealing keyboard focus from inputs
        const videoEl = player.el();
        if (videoEl) {
          videoEl.setAttribute('tabindex', '-1');
          // Also set on the actual video element inside
          const innerVideo = videoEl.querySelector('video');
          if (innerVideo) {
            innerVideo.setAttribute('tabindex', '-1');
          }
        }

        // Add custom skip controls to the control bar (not in wall mode)
        if (!wallMode) {
          const controlBar = player.controlBar;

          // Add backward 30s button
          const backward30Button = new Backward30Button(player);
          controlBar.addChild(backward30Button);

          // Add forward 30s button
          const forward30Button = new Forward30Button(player);
          controlBar.addChild(forward30Button);
        }
        
        // Track fullscreen state changes
        player.on('fullscreenchange', () => {
          wasFullscreenRef.current = player.isFullscreen();
        });
        
        
        
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
        
        // Initialize markers after player is ready
        if (markers && markers.length > 0) {
          addCustomMarkers(player, markers);
        }
        
        // Start playback after offset is applied and player is fully ready
        if (options.autoplay) {
          // Wait for the next tick to ensure offset is fully applied
          setTimeout(() => {
            if (player && !player.isDisposed()) {
              player.play();
            }
          }, 0);
        }
      }));
    } else {
      const player = playerRef.current;

      console.log('[VideoJS] Source change detected', {
        offset: { start: offsetStart, end: offsetEnd },
        source: sourceUrl?.slice(-50),
        hasStarted: props.hasStarted
      });

      // Disable native autoplay to prevent playback before offset is applied
      player.autoplay(false);

      // Apply offset BEFORE loading new source so the plugin is ready
      if (offsetStart !== undefined && offsetEnd !== undefined) {
        player.offset({ start: offsetStart, end: offsetEnd });
        console.log('[VideoJS] Offset applied:', offsetStart, '->', offsetEnd);
      }

      player.src([{ src: sourceUrl, type: 'video/mp4' }]);
      console.log('[VideoJS] Source set, waiting for loadedmetadata...');

      // Wait for metadata to load before seeking and playing
      player.one('loadedmetadata', () => {
        if (player.isDisposed()) {
          console.log('[VideoJS] Player disposed before metadata loaded');
          return;
        }

        const realTimeBefore = player.tech_?.currentTime?.() || 'unknown';
        console.log('[VideoJS] Metadata loaded, real currentTime before seek:', realTimeBefore);

        // Seek to position 0 in offset-adjusted time (which is _offsetStart in real time)
        player.currentTime(0);

        const realTimeAfter = player.tech_?.currentTime?.() || 'unknown';
        console.log('[VideoJS] After seek to 0, real currentTime:', realTimeAfter, 'expected:', offsetStart);

        if (props.hasStarted) {
          console.log('[VideoJS] Starting playback');
          player.play()?.catch((e) => console.log('[VideoJS] Play failed:', e));
        }

        // Restore fullscreen state if it was previously fullscreen
        if (wasFullscreenRef.current && !player.isFullscreen()) {
          player.requestFullscreen();
        }
      });
    }
  }, [sourceUrl, offsetStart, offsetEnd, props.hasStarted]);

  // Update markers when markers prop changes
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (markers && markers.length > 0) {
      addCustomMarkers(player, markers);
    }
  }, [markers]);

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

// Custom comparison function for React.memo to prevent unnecessary re-renders
const arePropsEqual = (prevProps, nextProps) => {
  // Check if sources have changed (the main thing that should trigger a re-render)
  const prevSources = prevProps.options?.sources;
  const nextSources = nextProps.options?.sources;

  const sourcesEqual = JSON.stringify(prevSources) === JSON.stringify(nextSources);

  // Check other critical props
  const offsetEqual = JSON.stringify(prevProps.offset) === JSON.stringify(nextProps.offset);
  const hasStartedEqual = prevProps.hasStarted === nextProps.hasStarted;
  const onEndedEqual = prevProps.onEnded === nextProps.onEnded;
  const wallModeEqual = prevProps.wallMode === nextProps.wallMode;

  // For markers, only re-render if sources change - let the useEffect handle marker updates
  // This prevents video reloads when markers are added/updated
  return sourcesEqual && offsetEqual && hasStartedEqual && onEndedEqual && wallModeEqual;
};

export default React.memo(VideoJS, arePropsEqual);