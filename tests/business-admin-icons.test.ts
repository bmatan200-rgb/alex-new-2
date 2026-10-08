import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_ADMIN_ICON_IDS, BUSINESS_ICON_CATEGORIES, BUSINESS_ICON_COLORS, BUSINESS_ICON_SYMBOLS, businessAdminIconId, businessAdminIconSvg, isBusinessAdminIconId } from '../src/utils/businessAdminIcons';

test('the icon gallery has 24 crisp vector choices per service category',()=>{
  for (const category of BUSINESS_ICON_CATEGORIES.filter((item) => item.id !== 'classic')) {
    assert.equal(BUSINESS_ICON_SYMBOLS.filter((symbol) => symbol.category === category.id).length,24,category.label);
  }
  assert.equal(BUSINESS_ADMIN_ICON_IDS.length,new Set(BUSINESS_ADMIN_ICON_IDS).size);
  assert.equal(BUSINESS_ICON_SYMBOLS.length * BUSINESS_ICON_COLORS.length,1616);
  assert.ok(BUSINESS_ADMIN_ICON_IDS.length >= BUSINESS_ICON_SYMBOLS.length * BUSINESS_ICON_COLORS.length);
  assert.ok(isBusinessAdminIconId('flower_purple'));
  assert.ok(isBusinessAdminIconId(businessAdminIconId('diamond','teal')));
  assert.ok(isBusinessAdminIconId('star_fuchsia'),'legacy business icon IDs remain valid');
  for (const symbol of ['flower','diamond','crown','sparkle','butterfly','leaf','moon','sun','heart','lotus','bouquet','palette','lavender','sunflower','shell','peacock','mirror','eye','music','wand','star','orange','nails','hibiscus']) {
    for (const color of BUSINESS_ICON_COLORS) assert.ok(isBusinessAdminIconId(`${symbol}_${color.id}`), `legacy icon ${symbol}_${color.id} remains valid`);
  }
  assert.equal(isBusinessAdminIconId('not-an-icon'),false);
});

test('icon artwork is vector based, escapes business labels, and preserves unique palettes',()=>{
  const a=businessAdminIconSvg('flower_purple','סטודיו פרח');
  const b=businessAdminIconSvg('diamond_teal','Avi Studio');
  assert.ok(a?.startsWith('<svg'));
  assert.notEqual(a,b);
  assert.match(a!,/<path/);
  assert.match(a!,/סטודיו פרח/);
  assert.match(b!,/#0f766e/);
  assert.match(businessAdminIconSvg('flower_purple','<script>')!, /&lt;script&gt;/);
  assert.equal(businessAdminIconSvg('"><script>'),null);
});
