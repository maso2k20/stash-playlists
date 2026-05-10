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

        seekBar.el().appendChild(rangeEl);
      }

      // Add to seekbar
      seekBar.el().appendChild(markerEl);
    });
  });
};

export const VideoJS = (props) => {
  const videoRef = React.useRef(null);
  const playerRef = React.useRef(null);
  const vttBlobRef = React.useRef(null);
  const suppressErrorsRef = React.useRef(false);
  const suppressTimeoutRef = React.useRef(null);
  const hasInitializedRef = React.useRef(false);
  const onEndedRef = React.useRef(props.onEnded);
  const { options, onReady, offset, vttPath, stashServer, stashAPI, markers, wallMode } = props;

  const sourceUrl = options?.sources?.[0]?.src;
  const offsetStart = offset?.start;
  const offsetEnd = offset?.end;

  const [visible, setVisible] = React.useState(true);

  // Keep latest onEnded in a ref so the player listener (registered once at
  // mount) always invokes the current handler.
  React.useEffect(() => {
    onEndedRef.current = props.onEnded;
  }, [props.onEnded]);

  // Mount the player once. Source changes are handled by the effect below
  // via player.src() so the player element is never disposed mid-playlist —
  // this preserves fullscreen across track changes.
  React.useEffect(() => {
    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');
    videoRef.current.appendChild(videoElement);

    const playerOptions = {
      ...options,
      sources: [], // Source loading is handled entirely by the source-change effect
      autoplay: false, // We call play() after offset is applied
      userActions: {
        ...options?.userActions,
        doubleClick: false,
        hotkeys: false,
      },
    };

    const player = (playerRef.current = videojs(videoElement, playerOptions, () => {
      // Prevent the video element from stealing keyboard focus from inputs
      const videoEl = player.el();
      if (videoEl) {
        videoEl.setAttribute('tabindex', '-1');
        const innerVideo = videoEl.querySelector('video');
        if (innerVideo) innerVideo.setAttribute('tabindex', '-1');
      }

      // Add custom skip controls to the control bar (not in wall mode)
      if (!wallMode) {
        const controlBar = player.controlBar;
        controlBar.addChild(new Backward30Button(player));
        controlBar.addChild(new Forward30Button(player));
      }

      // Initialize VTT thumbnails if path is provided
      if (vttPath && stashServer && stashAPI) {
        processVttFile(vttPath, stashServer, stashAPI)
          .then((vttBlobUrl) => {
            if (vttBlobUrl) {
              vttBlobRef.current = vttBlobUrl;
              player.vttThumbnails({ src: vttBlobUrl, showTimestamp: true, responsive: true, width: 160, height: 90 });
            }
          })
          .catch((error) => console.error('Failed to initialize VTT thumbnails:', error));
      }

      if (onReady) onReady(player);

      if (markers && markers.length > 0) {
        addCustomMarkers(player, markers);
      }

      // Use a stable wrapper so source changes pick up the latest onEnded.
      player.on('ended', () => onEndedRef.current?.());

      // Suppress transient media errors fired during source transitions.
      // The browser sometimes fires error events when aborting the previous
      // source's request or hitting a transient hiccup on the new one — these
      // are harmless and the new source loads fine. Real failures still
      // surface via the 3s timeout fallback.
      player.on('error', () => {
        if (suppressErrorsRef.current) {
          player.error(null);
        }
      });
    }));

    return () => {
      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
      if (vttBlobRef.current) {
        cleanupVttBlob(vttBlobRef.current);
        vttBlobRef.current = null;
      }
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle source / offset changes WITHOUT remounting the player.
  // Keeping the same player instance preserves fullscreen state across tracks
  // and avoids the dispose/recreate cycle that loses fullscreen.
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;
    if (!sourceUrl) return;

    const isFirstLoad = !hasInitializedRef.current;
    hasInitializedRef.current = true;

    // Suppress errors during the source change. Skipped on first load — there
    // is no previous request to abort, so the error event won't fire from a
    // transition. Wall mode (autoplay:true) and playlist mode both benefit
    // from this on subsequent track changes.
    if (!isFirstLoad) {
      suppressErrorsRef.current = true;
      player.addClass('vjs-suppress-errors');
      player.error(null);

      if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = setTimeout(() => {
        // 3s window expired; let real errors through if anything's still wrong.
        suppressErrorsRef.current = false;
        if (playerRef.current && !playerRef.current.isDisposed()) {
          playerRef.current.removeClass('vjs-suppress-errors');
        }
      }, 3000);
    }

    // Only touch the offset plugin if the caller actually wants an offset.
    // Calling player.offset() with end:Infinity activates the plugin and
    // makes player.duration() return Infinity (it reports end-start), which
    // breaks any consumer that relies on real duration (e.g. the scene
    // editor's timeline ruler).
    const hasOffset = typeof offsetStart === 'number' || typeof offsetEnd === 'number';
    if (hasOffset) {
      // Reset plugin state before changing source so it doesn't carry over.
      player.offset({ start: 0, end: Infinity, restart_beginning: false });
    }

    setVisible(true);
    player.src([{ src: sourceUrl, type: 'video/mp4' }]);

    const effectiveStart = typeof offsetStart === 'number' ? offsetStart : 0;
    const effectiveEnd = typeof offsetEnd === 'number' ? offsetEnd : Infinity;

    // First load follows the parent's autoplay preference (wall mode wants
    // autoplay; playlist mode does not — user clicks play). Every subsequent
    // load autoplays so playlist tracks chain seamlessly.
    const shouldAutoplay = !isFirstLoad || !!options.autoplay;

    player.one('loadedmetadata', () => {
      if (player.isDisposed()) return;

      if (suppressTimeoutRef.current) {
        clearTimeout(suppressTimeoutRef.current);
        suppressTimeoutRef.current = null;
      }
      suppressErrorsRef.current = false;
      player.removeClass('vjs-suppress-errors');

      if (hasOffset) {
        player.offset({ start: effectiveStart, end: effectiveEnd, restart_beginning: false });
        player.currentTime(0);
      }

      setTimeout(() => {
        if (player.isDisposed()) return;
        const actualTime = player.tech_?.currentTime?.() || 0;
        if (Math.abs(actualTime - effectiveStart) > 1 && effectiveStart > 0) {
          try { player.tech_.setCurrentTime(effectiveStart); } catch (e) {}
        }
      }, 50);

      if (shouldAutoplay) {
        player.play()?.catch((e) => console.log('[VideoJS] play failed:', e));
      }
    });
  }, [sourceUrl, offsetStart, offsetEnd]);

  // Update markers when markers prop changes within the same mount
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player || !markers?.length) return;
    addCustomMarkers(player, markers);
  }, [markers]);

  // Fade out in last 2 seconds before offset end
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player || !offset) return;

    const handleTimeUpdate = () => {
      const clipDuration = (offset.end ?? Infinity) - (offset.start ?? 0);
      if (player.currentTime() >= clipDuration - 2) setVisible(false);
    };

    player.on('timeupdate', handleTimeUpdate);
    return () => player.off('timeupdate', handleTimeUpdate);
  }, [offset]);

  // Fade in after seek (covers remount and manual seeking)
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const handleSeeked = () => setVisible(true);
    player.on('seeked', handleSeeked);
    return () => player.off('seeked', handleSeeked);
  }, []);

  return (
    <div
      className='video-player'
      data-vjs-player
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 1s' }}
    >
      <div ref={videoRef} />
    </div>
  );
};

// Only re-render if props that affect the DOM/player actually change.
// In playlist mode the parent remounts via key, so this mostly guards wall mode.
const arePropsEqual = (prevProps, nextProps) => {
  const sourcesEqual = JSON.stringify(prevProps.options?.sources) === JSON.stringify(nextProps.options?.sources);
  const offsetEqual = JSON.stringify(prevProps.offset) === JSON.stringify(nextProps.offset);
  const onEndedEqual = prevProps.onEnded === nextProps.onEnded;
  const wallModeEqual = prevProps.wallMode === nextProps.wallMode;
  return sourcesEqual && offsetEqual && onEndedEqual && wallModeEqual;
};

export default React.memo(VideoJS, arePropsEqual);
