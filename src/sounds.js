// Short tones that confirm hands-free actions, since HandTap is usually behind the app
// being used and its screen can't be seen. Sound must never get in the way of tracking.
let context = null;

function play(notes) {
  try {
    context ??= new AudioContext();
    context.resume();
    notes.forEach(({ frequency, delay = 0, duration = 0.09 }) => {
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    });
  } catch (error) {
    console.warn('Could not play a sound.', error);
  }
}

export const playTypingOn = () => play([{ frequency: 520 }, { frequency: 780, delay: 0.1 }]);
export const playTypingOff = () => play([{ frequency: 780 }, { frequency: 520, delay: 0.1 }]);
export const playDigitTyped = () => play([{ frequency: 900, duration: 0.05 }]);
