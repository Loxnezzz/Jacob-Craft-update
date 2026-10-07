// Recipe discovery: the recipe book starts small and fills in as you go. A recipe is revealed the first time you
// hold any of its ingredients (or the thing it makes), with a quiet note by the hotbar rather than a popup.
// Creative mode shows everything.
import { ITEMS, itemByName } from './items.js';
import { RECIPES, SMELT, recipeIngredients, ingredientMatches } from './recipes.js';

export function installRecipeUnlocks(game) {
  const ui = game.ui;
  const fresh = game.freshRecipes = new Set();   // result ids revealed since the book was last looked at

  // what the player has ever held, as a set of item ids
  const seen = () => {
    const p = game.player;
    if (!p.seenItems) { p.seenItems = new Set(); scan(true); }
    return p.seenItems;
  };
  const ingSeen = (ing, S) => {
    if (!ing.startsWith('#')) { const it = itemByName(ing); return !!it && S.has(it.id); }
    for (const id of S) if (ingredientMatches(ing, id)) return true;
    return false;
  };
  game.recipeUnlocked = (r) => {
    const p = game.player;
    if (!p || p.creative) return true;
    const open = p._recipesOpen || (p._recipesOpen = new WeakSet());   // per player (per world): only ever flips to true
    if (open.has(r)) return true;
    const S = seen();
    let ok = S.has(r.result);
    if (!ok) for (const ing of recipeIngredients(r).keys()) if (ingSeen(ing, S)) { ok = true; break; }
    if (ok) open.add(r);
    return ok;
  };
  game.smeltUnlocked = (inName) => {
    const p = game.player;
    if (!p || p.creative) return true;
    const it = itemByName(inName);
    return !!it && seen().has(it.id);
  };
  game.lockedRecipeCount = () => {
    const known = new Set(), all = new Set();
    for (const r of RECIPES) { all.add(r.result); if (game.recipeUnlocked(r)) known.add(r.result); }
    return all.size - known.size;
  };

  // look through everything the player carries for items not seen before
  function scan(silent = false) {
    const p = game.player;
    if (!p) return;
    if (!p.seenItems) { p.seenItems = new Set(); silent = true; }   // a fresh world, or one from before this update
    const S = p.seenItems;
    const ids = [];
    const look = (s) => { if (s && s.id && !S.has(s.id)) ids.push(s.id); };
    p.inventory.slots.forEach(look); p.armor.slots.forEach(look);
    if (p.offhand) p.offhand.slots.forEach(look);
    look(p.cursor);
    if (!ids.length) return;
    // which results become craftable-to-know because of these?
    const before = new Set();
    if (!silent) for (const r of RECIPES) if (game.recipeUnlocked(r)) before.add(r.result);
    for (const id of ids) S.add(id);
    if (silent || p.creative) return;
    const gained = [];
    for (const r of RECIPES) if (!before.has(r.result) && game.recipeUnlocked(r) && !gained.includes(r.result)) gained.push(r.result);
    if (!gained.length) return;
    for (const id of gained) fresh.add(id);
    const names = gained.slice(0, 2).map(id => ITEMS[id].label);
    const more = gained.length - names.length;
    ui.notice(`New recipe${gained.length > 1 ? 's' : ''}: ${names.join(', ')}${more > 0 ? ` +${more}` : ''}`, gained[0]);
    if (ui.screen && ui.bookGrid) ui.renderBook();
  }
  game.scanSeenItems = scan;

  let t = 0;
  const prevExt = game.extUpdate;
  game.extUpdate = (dt) => {
    prevExt && prevExt(dt);
    if (!game.player) return;
    t += dt;
    if (t < 0.4) return;
    t = 0;
    scan(false);
  };
}

export { SMELT };
