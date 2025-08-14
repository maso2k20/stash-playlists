import videojs from 'video.js';

// VideoJS component class
const Component = videojs.getComponent('Component');
const Button = videojs.getComponent('Button');

// Forward 30 seconds button
class Forward30Button extends Button {
  constructor(player, options) {
    super(player, options);
    this.controlText('Skip forward 30 seconds');
  }

  buildCSSClass() {
    return 'vjs-forward-30-control vjs-control vjs-button';
  }

  createEl() {
    const el = super.createEl();
    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display: block; margin: 0 auto;">
        <path d="M12,5V1L17,6L12,11V7A6,6 0 0,0 6,13A6,6 0 0,0 12,19A6,6 0 0,0 18,13H20A8,8 0 0,1 12,21A8,8 0 0,1 4,13A8,8 0 0,1 12,5Z"/>
        <text x="12" y="15" font-size="7" text-anchor="middle" fill="currentColor" font-weight="bold">30</text>
      </svg>
    `;
    return el;
  }

  handleClick() {
    const player = this.player();
    const currentTime = player.currentTime();
    const duration = player.duration();
    const newTime = Math.min(currentTime + 30, duration);
    
    player.currentTime(newTime);
  }
}

// Backward 30 seconds button  
class Backward30Button extends Button {
  constructor(player, options) {
    super(player, options);
    this.controlText('Skip backward 30 seconds');
  }

  buildCSSClass() {
    return 'vjs-backward-30-control vjs-control vjs-button';
  }

  createEl() {
    const el = super.createEl();
    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style="display: block; margin: 0 auto;">
        <path d="M12,5V1L7,6L12,11V7A6,6 0 0,1 18,13A6,6 0 0,1 12,19A6,6 0 0,1 6,13H4A8,8 0 0,0 12,21A8,8 0 0,0 20,13A8,8 0 0,0 12,5Z"/>
        <text x="12" y="15" font-size="7" text-anchor="middle" fill="currentColor" font-weight="bold">30</text>
      </svg>
    `;
    return el;
  }

  handleClick() {
    const player = this.player();
    const currentTime = player.currentTime();
    const newTime = Math.max(currentTime - 30, 0);
    
    player.currentTime(newTime);
  }
}

// Register the components with VideoJS
videojs.registerComponent('Forward30Button', Forward30Button);
videojs.registerComponent('Backward30Button', Backward30Button);

export { Forward30Button, Backward30Button };