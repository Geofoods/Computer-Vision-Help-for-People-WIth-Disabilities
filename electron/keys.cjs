// Translates a shortcut such as "Ctrl+Shift+T" into Windows virtual-key codes. The
// renderer only ever sends names, so nothing it sends can reach the helper's stdin as-is.

const MODIFIERS = { Ctrl: 0x11, Alt: 0x12, Shift: 0x10, Win: 0x5b };

const KEYS = {
  Enter: 0x0d,
  Esc: 0x1b,
  Tab: 0x09,
  Space: 0x20,
  Backspace: 0x08,
  Delete: 0x2e,
  Insert: 0x2d,
  Home: 0x24,
  End: 0x23,
  'Page Up': 0x21,
  'Page Down': 0x22,
  Left: 0x25,
  Up: 0x26,
  Right: 0x27,
  Down: 0x28,
  ';': 0xba,
  '=': 0xbb,
  ',': 0xbc,
  '-': 0xbd,
  '.': 0xbe,
  '/': 0xbf,
  '`': 0xc0,
  '[': 0xdb,
  '\\': 0xdc,
  ']': 0xdd,
  "'": 0xde,
  'Volume Up': 0xaf,
  'Volume Down': 0xae,
  Mute: 0xad,
  'Play/Pause': 0xb3,
  'Next Track': 0xb0,
  'Previous Track': 0xb1,
};
const ACTIONS = new Set(['Left Click', 'Scroll Down']);
for (let code = 0x41; code <= 0x5a; code += 1) KEYS[String.fromCharCode(code)] = code;
for (let digit = 0; digit <= 9; digit += 1) KEYS[String(digit)] = 0x30 + digit;
for (let number = 1; number <= 12; number += 1) KEYS[`F${number}`] = 0x6f + number;

const has = (table, name) => Object.prototype.hasOwnProperty.call(table, name);

/** Returns codes in press order: modifiers, then the one main key. Throws on anything else. */
function comboToKeyCodes(combo) {
  if (typeof combo !== 'string') throw new Error('Invalid key combination.');
  if (ACTIONS.has(combo)) return [];
  const names = combo.split('+');
  const key = names.pop();
  const unique = new Set(names).size === names.length;
  if (!has(KEYS, key) || !unique || !names.every((name) => has(MODIFIERS, name))) {
    throw new Error(`"${combo}" is not a key combination HandTap can press.`);
  }
  return [...names.map((name) => MODIFIERS[name]), KEYS[key]];
}

module.exports = { comboToKeyCodes };
