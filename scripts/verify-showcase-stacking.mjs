import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

console.log('--- STARTING ADVERSARIAL STACKING & SHOWCASE VERIFICATION ---');

// 1. Inspect main.jsx DOM Placement
const mainJsxPath = path.resolve('src/main.jsx');
const mainJsx = fs.readFileSync(mainJsxPath, 'utf8');
const lines = mainJsx.split('\n');

let heroShellCloseLine = -1;
let launchFilmSectionLine = -1;
let practiceSectionLine = -1;

for (let i = 0; i < lines.length; i++) {
  const lineNum = i + 1;
  const line = lines[i];

  if (line.includes('</section>') && lineNum > 1515 && lineNum < 1530) {
    heroShellCloseLine = lineNum;
  }
  if (line.includes('<LaunchFilmSection')) {
    launchFilmSectionLine = lineNum;
  }
  if (line.includes('<ScrollSection aria-labelledby="practice-heading">')) {
    practiceSectionLine = lineNum;
  }
}

console.log(`[DOM Placement] .hero-stage-shell </section> at line ${heroShellCloseLine}`);
console.log(`[DOM Placement] <LaunchFilmSection /> at line ${launchFilmSectionLine}`);
console.log(`[DOM Placement] Practice Section at line ${practiceSectionLine}`);

assert.ok(heroShellCloseLine !== -1, 'hero-stage-shell closing tag must be found around line 1520');
assert.ok(launchFilmSectionLine !== -1, '<LaunchFilmSection /> must be found in main.jsx');
assert.ok(practiceSectionLine !== -1, 'practice section must be found in main.jsx');

// Verify line range constraint: strictly between line 1520 and 1526
assert.ok(
  launchFilmSectionLine >= 1520 && launchFilmSectionLine <= 1526,
  `LaunchFilmSection line (${launchFilmSectionLine}) must be between 1520 and 1526`,
);

// Verify strictly outside hero-stage-shell and before practice section
assert.ok(
  launchFilmSectionLine > heroShellCloseLine,
  `<LaunchFilmSection /> (${launchFilmSectionLine}) must appear after .hero-stage-shell closing tag (${heroShellCloseLine})`,
);
assert.ok(
  launchFilmSectionLine < practiceSectionLine,
  `<LaunchFilmSection /> (${launchFilmSectionLine}) must appear before practice section (${practiceSectionLine})`,
);

// 2. Inspect Stacking Contexts and z-index hierarchy in src/styles.css
const stylesPath = path.resolve('src/styles.css');
const styles = fs.readFileSync(stylesPath, 'utf8');

function extractRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 's');
  const match = styles.match(regex);
  assert.ok(match, `Rule for ${selector} must exist in src/styles.css`);
  const body = match[1];
  const zIndexMatch = body.match(/z-index:\s*(\d+)/);
  const positionMatch = body.match(/position:\s*([a-z-]+)/);
  const pointerEventsMatch = body.match(/pointer-events:\s*([a-z-]+)/);
  return {
    body,
    zIndex: zIndexMatch ? parseInt(zIndexMatch[1], 10) : null,
    position: positionMatch ? positionMatch[1] : null,
    pointerEvents: pointerEventsMatch ? pointerEventsMatch[1] : null,
  };
}

const showcase = extractRule('.showcase-section');
console.log(`[Stacking] .showcase-section: position=${showcase.position}, z-index=${showcase.zIndex}`);
assert.equal(showcase.position, 'relative', '.showcase-section must be position: relative');
assert.ok(showcase.zIndex !== null && showcase.zIndex >= 1, '.showcase-section z-index must be >= 1');

const glow = extractRule('.showcase-ambient-glow');
console.log(`[Stacking] .showcase-ambient-glow: position=${glow.position}, z-index=${glow.zIndex}, pointer-events=${glow.pointerEvents}`);
assert.equal(glow.position, 'absolute', '.showcase-ambient-glow must be position: absolute');
assert.equal(glow.zIndex, 0, '.showcase-ambient-glow z-index must be 0 (behind player card)');
assert.equal(glow.pointerEvents, 'none', '.showcase-ambient-glow must be pointer-events: none');

const reflection = extractRule('.showcase-ambient-reflection');
console.log(`[Stacking] .showcase-ambient-reflection: position=${reflection.position}, z-index=${reflection.zIndex}, pointer-events=${reflection.pointerEvents}`);
assert.equal(reflection.position, 'absolute', '.showcase-ambient-reflection must be position: absolute');
assert.equal(reflection.zIndex, 0, '.showcase-ambient-reflection z-index must be 0 (behind player card)');
assert.equal(reflection.pointerEvents, 'none', '.showcase-ambient-reflection must be pointer-events: none');

const playerCard = extractRule('.showcase-player-card');
console.log(`[Stacking] .showcase-player-card: position=${playerCard.position}, z-index=${playerCard.zIndex}`);
assert.equal(playerCard.position, 'relative', '.showcase-player-card must be position: relative');
assert.ok(playerCard.zIndex !== null && playerCard.zIndex >= 1, '.showcase-player-card z-index must be >= 1');
assert.ok(playerCard.zIndex > glow.zIndex, '.showcase-player-card must stack above .showcase-ambient-glow');

// Verify .hero-stage-shell internal stacking
const heroShell = extractRule('.hero-stage-shell');
const gravityWrap = extractRule('.gravity-field-wrap');
const heroScrim = extractRule('.hero-stage-scrim');
const heroContent = extractRule('.hero');
console.log(`[Stacking] .hero-stage-shell: z-index=${heroShell.zIndex}`);
console.log(`[Stacking] .gravity-field-wrap: z-index=${gravityWrap.zIndex}, pointer-events=${gravityWrap.pointerEvents}`);
console.log(`[Stacking] .hero-stage-scrim: z-index=${heroScrim.zIndex}, pointer-events=${heroScrim.pointerEvents}`);
console.log(`[Stacking] .hero: z-index=${heroContent.zIndex}`);

assert.equal(heroShell.position, 'relative');
assert.equal(gravityWrap.zIndex, 0);
assert.equal(gravityWrap.pointerEvents, 'none');
assert.equal(heroScrim.zIndex, 1);
assert.equal(heroScrim.pointerEvents, 'none');
assert.equal(heroContent.zIndex, 2);
assert.ok(
  gravityWrap.zIndex < heroScrim.zIndex && heroScrim.zIndex < heroContent.zIndex,
  'Hero stage shell internal stacking must strictly be gravity-field-wrap (0) -> hero-stage-scrim (1) -> hero (2)',
);

// Verify no collision with overlays, topbar, and modals
const topbar = extractRule('.topbar');
const modalBackdrop = extractRule('.film-modal-backdrop');
console.log(`[Stacking] .topbar: z-index=${topbar.zIndex}`);
console.log(`[Stacking] .film-modal-backdrop: z-index=${modalBackdrop.zIndex}`);

assert.ok(topbar.zIndex >= 2, '.topbar must have z-index >= 2 to float above scrolling page sections');
assert.ok(topbar.zIndex > showcase.zIndex, '.topbar must be higher than .showcase-section');
assert.ok(modalBackdrop.zIndex >= 90, '.film-modal-backdrop must have z-index >= 90');
assert.ok(modalBackdrop.zIndex > topbar.zIndex, '.film-modal-backdrop must be higher than .topbar');

// 3. Inspect Physical Assets on Disk
const videoAssetPath = path.resolve('public/videos/handtap-launch-film.mp4');
const posterAssetPath = path.resolve('public/images/launch-film-poster.png');
const docsHtmlPath = path.resolve('docs/launch-film.html');

assert.ok(fs.existsSync(videoAssetPath), 'public/videos/handtap-launch-film.mp4 must exist');
assert.ok(fs.statSync(videoAssetPath).size > 1000000, 'Video asset must be a valid non-empty video file (>1MB)');

assert.ok(fs.existsSync(posterAssetPath), 'public/images/launch-film-poster.png must exist');
assert.ok(fs.statSync(posterAssetPath).size > 10000, 'Poster asset must be a valid non-empty image file (>10KB)');

assert.ok(fs.existsSync(docsHtmlPath), 'docs/launch-film.html must exist');
assert.ok(fs.statSync(docsHtmlPath).size > 100, 'docs/launch-film.html must be non-empty');

// 4. Inspect LaunchFilmSection.jsx Component Implementation
const lfsPath = path.resolve('src/components/LaunchFilmSection.jsx');
assert.ok(fs.existsSync(lfsPath), 'src/components/LaunchFilmSection.jsx must exist');
const lfsSource = fs.readFileSync(lfsPath, 'utf8');

// Strip comments before checking for component usage
const lfsSourceWithoutComments = lfsSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
assert.doesNotMatch(lfsSourceWithoutComments, /<ModuleIndex[\s/>]/, 'LaunchFilmSection MUST NOT render <ModuleIndex>');
assert.match(lfsSource, /src="videos\/handtap-launch-film\.mp4"/, 'Video element must specify src="videos/handtap-launch-film.mp4"');
assert.match(lfsSource, /poster="images\/launch-film-poster\.png"/, 'Video element must specify poster="images/launch-film-poster.png"');
assert.match(lfsSource, /\bcontrols\b/, 'Video element must have controls attribute');
assert.match(lfsSource, /\bplaysInline\b/, 'Video element must have playsInline attribute');
assert.match(lfsSource, /\bpreload="metadata"/, 'Video element must have preload="metadata"');
assert.match(lfsSource, /docs\/launch-film\.html/, 'Link must point to docs/launch-film.html');
assert.match(lfsSource, /isPlaying\s*\?\s*['"]is-playing['"]/, 'Stage must toggle is-playing class when video plays');

// 5. Inspect Global ModuleIndex Invariant
const setupJsx = fs.readFileSync('src/SetupPanel.jsx', 'utf8');
const numberTypingJsx = fs.readFileSync('src/NumberTyping.jsx', 'utf8');
const keybindsJsx = fs.readFileSync('src/KeybindSection.jsx', 'utf8');
const allJsx = [mainJsx, setupJsx, numberTypingJsx, keybindsJsx, lfsSource].join('\n');
const indexMatches = [...allJsx.matchAll(/<ModuleIndex\s+index=\{?(\d+)\}?\s+label="([^"]+)"/g)];

console.log(`[ModuleIndex] Found ${indexMatches.length} <ModuleIndex> markers across all components`);
assert.equal(indexMatches.length, 5, 'Must have strictly 5 <ModuleIndex> markers across the application');
for (let i = 0; i < 5; i++) {
  const idx = parseInt(indexMatches[i][1], 10);
  const lbl = indexMatches[i][2];
  assert.equal(idx, i + 1, `ModuleIndex at position ${i} must have index ${i + 1}`);
  console.log(`  - Module 0${idx}: "${lbl}"`);
}

// 6. Inspect Reduced Motion & EOF Invariant
const eofReducedMotionRegex = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*$/;
assert.match(styles, eofReducedMotionRegex, 'src/styles.css must terminate with @media (prefers-reduced-motion: reduce)');

// 7. Verify No Purple Slop Gradients
const purpleSlopRegex = /linear-gradient\([^)]*#8[0-9a-f]{5}[^)]*\)/i;
assert.doesNotMatch(styles, purpleSlopRegex, 'src/styles.css must not contain purple #8xxxxx gradients');

console.log('--- ALL ADVERSARIAL ASSERTIONS PASSED WITH ZERO ERRORS ---');
