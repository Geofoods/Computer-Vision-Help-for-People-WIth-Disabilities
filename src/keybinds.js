// Keybind data and helpers, kept free of React so they can be unit tested.

const STORAGE_KEY = 'handtap.keybinds';
const TOGGLE_KEY = 'handtap.typingToggle';
const SOUNDS_KEY = 'handtap.sounds';
// Earlier versions kept the typing toggle among the shortcuts, under this name.
const OLD_TOGGLE_COMBO = 'NumberTyping';

// A fist isn't offered because closing the hand is what types a number.
export const TYPING_TOGGLES = [
  { id: 'ringTap', label: 'Hold thumb + ring finger', instruction: 'Hold your thumb on your ring finger for half a second' },
  { id: 'middleTap', label: 'Hold thumb + middle finger', instruction: 'Hold your thumb on your middle finger for half a second' },
  { id: 'swipeLeft', label: 'Swipe left', instruction: 'Swipe left' },
  { id: 'swipeRight', label: 'Swipe right', instruction: 'Swipe right' },
  { id: 'swipeUp', label: 'Swipe up', instruction: 'Swipe up' },
  { id: 'swipeDown', label: 'Swipe down', instruction: 'Swipe down' },
];
const isToggle = (id) => TYPING_TOGGLES.some((toggle) => toggle.id === id);

export const MOVEMENTS = [
  { id: 'indexTap', label: 'Tap thumb + index', hint: 'Touch your thumb to your index finger' },
  { id: 'tongueLick', label: 'Tongue lick', hint: 'Stick out your tongue briefly' },
  { id: 'headTiltLeft', label: 'Tilt head left', hint: 'Tilt your head to the left' },
  { id: 'headTiltRight', label: 'Tilt head right', hint: 'Tilt your head to the right' },
  { id: 'swipeLeft', label: 'Swipe left', hint: 'Sweep your hand quickly to the left' },
  { id: 'swipeRight', label: 'Swipe right', hint: 'Sweep your hand quickly to the right' },
  { id: 'swipeUp', label: 'Swipe up', hint: 'Sweep your hand quickly upward' },
  { id: 'swipeDown', label: 'Swipe down', hint: 'Sweep your hand quickly downward' },
  { id: 'fist', label: 'Make a fist', hint: 'Curl all four fingers into your palm' },
  { id: 'middleTap', label: 'Tap thumb + middle', hint: 'Touch your thumb to your middle finger' },
  { id: 'ringTap', label: 'Tap thumb + ring', hint: 'Touch your thumb to your ring finger' },
];

export const DEFAULT_BINDINGS = {
  indexTap: 'Left Click',
  tongueLick: 'Scroll Down',
  headTiltLeft: 'Alt+Left',
  headTiltRight: 'Alt+Right',
  swipeLeft: 'Left',
  swipeRight: 'Right',
  swipeUp: 'Up',
  swipeDown: 'Down',
  fist: 'Esc',
  middleTap: 'Ctrl+C',
  ringTap: 'Ctrl+V',
};

// Listed so nobody has to physically press a shortcut, which may be the reason they use this app.
export const PRESET_GROUPS = [
  {
    label: 'Editing',
    presets: [
      { label: 'Left click', combo: 'Left Click' },
      { label: 'Right click', combo: 'Right Click' },
      { label: 'Double click', combo: 'Double Click' },
      { label: 'Hold or release drag', combo: 'Toggle Drag' },
      { label: 'Scroll down', combo: 'Scroll Down' },
      { label: 'Scroll up', combo: 'Scroll Up' },
      { label: 'Copy', combo: 'Ctrl+C' },
      { label: 'Paste', combo: 'Ctrl+V' },
      { label: 'Cut', combo: 'Ctrl+X' },
      { label: 'Undo', combo: 'Ctrl+Z' },
      { label: 'Redo', combo: 'Ctrl+Y' },
      { label: 'Select all', combo: 'Ctrl+A' },
      { label: 'Save', combo: 'Ctrl+S' },
    ],
  },
  {
    label: 'Keys',
    presets: [
      { label: 'Enter', combo: 'Enter' },
      { label: 'Escape', combo: 'Esc' },
      { label: 'Tab', combo: 'Tab' },
      { label: 'Space', combo: 'Space' },
      { label: 'Backspace', combo: 'Backspace' },
      { label: 'Page up', combo: 'Page Up' },
      { label: 'Page down', combo: 'Page Down' },
      { label: 'Arrow left', combo: 'Left' },
      { label: 'Arrow right', combo: 'Right' },
      { label: 'Arrow up', combo: 'Up' },
      { label: 'Arrow down', combo: 'Down' },
    ],
  },
  {
    label: 'Windows and browser',
    presets: [
      { label: 'Switch app', combo: 'Alt+Tab' },
      { label: 'Show desktop', combo: 'Win+D' },
      { label: 'Browser back', combo: 'Alt+Left' },
      { label: 'Browser forward', combo: 'Alt+Right' },
      { label: 'Next tab', combo: 'Ctrl+Tab' },
    ],
  },
  {
    label: 'Media',
    presets: [
      { label: 'Play or pause', combo: 'Play/Pause' },
      { label: 'Next track', combo: 'Next Track' },
      { label: 'Volume up', combo: 'Volume Up' },
      { label: 'Volume down', combo: 'Volume Down' },
      { label: 'Mute', combo: 'Mute' },
    ],
  },
];

const PRESET_COMBOS = new Set(PRESET_GROUPS.flatMap(({ presets }) => presets.map(({ combo }) => combo)));
export const isPreset = (combo) => PRESET_COMBOS.has(combo);

const CODE_NAMES = {
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Space: 'Space',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  ArrowLeft: 'Left',
  ArrowUp: 'Up',
  ArrowRight: 'Right',
  ArrowDown: 'Down',
  Semicolon: ';',
  Equal: '=',
  Comma: ',',
  Minus: '-',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  BracketLeft: '[',
  Backslash: '\\',
  BracketRight: ']',
  Quote: "'",
  AudioVolumeUp: 'Volume Up',
  AudioVolumeDown: 'Volume Down',
  AudioVolumeMute: 'Mute',
  MediaPlayPause: 'Play/Pause',
  MediaTrackNext: 'Next Track',
  MediaTrackPrevious: 'Previous Track',
};

function keyName({ code, key }) {
  // event.key follows the keyboard layout, so an AZERTY "A" key records as A rather than Q.
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return CODE_NAMES[code] ?? null;
}

/** The shortcut a keydown event describes, or null for a lone modifier or an unsupported key. */
export function comboFromEvent(event) {
  const name = keyName(event);
  if (!name) return null;
  const modifiers = [
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    event.metaKey && 'Win',
  ].filter(Boolean);
  return [...modifiers, name].join('+');
}

/** Saved bindings, ignoring anything malformed. Storage can throw or be empty. */
export function loadBindings(storage) {
  const bindings = { ...DEFAULT_BINDINGS };
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)) ?? {};
    for (const { id } of MOVEMENTS) {
      // An empty string is kept: it's how someone turns off a movement that has a default.
      if (typeof saved[id] === 'string' && saved[id] !== OLD_TOGGLE_COMBO) bindings[id] = saved[id];
    }
  } catch (error) {
    console.warn('Could not load keybinds.', error);
  }
  return bindings;
}

/** Whether someone chose a shortcut for this movement, as opposed to it having a default. */
export function hasOwnShortcut(bindings, id) {
  return Boolean(bindings[id]) && bindings[id] !== DEFAULT_BINDINGS[id];
}

/**
 * The movement that toggles number typing, or '' for none. New setups get a tap that no
 * shortcut is using, so the feature works hands-free without anyone setting it up first.
 */
export function loadTypingToggle(storage) {
  try {
    const stored = storage.getItem(TOGGLE_KEY);
    if (stored === '' || isToggle(stored)) return stored;
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)) ?? {};
    const old = TYPING_TOGGLES.find(({ id }) => saved[id] === OLD_TOGGLE_COMBO);
    if (old) return old.id;
    return ['ringTap', 'middleTap'].find((id) => !hasOwnShortcut(saved, id)) ?? '';
  } catch (error) {
    console.warn('Could not load the number typing toggle.', error);
    return 'ringTap';
  }
}

/** Sounds are on unless someone turned them off. */
export function loadSoundsOn(storage) {
  try {
    return storage.getItem(SOUNDS_KEY) !== 'off';
  } catch (error) {
    return true;
  }
}

export function saveTypingPreferences(storage, typingToggle, soundsOn) {
  try {
    storage.setItem(TOGGLE_KEY, typingToggle);
    storage.setItem(SOUNDS_KEY, soundsOn ? 'on' : 'off');
  } catch (error) {
    console.warn('Could not save number typing preferences.', error);
  }
}

export function saveBindings(storage, bindings) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch (error) {
    console.warn('Could not save keybinds.', error);
  }
}
