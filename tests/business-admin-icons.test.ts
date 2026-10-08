import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUSINESS_ADMIN_ICON_IDS, BUSINESS_ICON_CATEGORIES, BUSINESS_ICON_COLORS, BUSINESS_ICON_RASTER_SYMBOL_IDS, BUSINESS_ICON_SYMBOLS, businessAdminIconId, businessAdminIconPreviewAsset, businessAdminIconPreviewSvg, businessAdminIconAssetUrl, businessAdminIconSvg, isBusinessAdminIconId, isBusinessAdminRasterIcon } from '../src/utils/businessAdminIcons';

test('the icon gallery has 28 profession-specific choices per service category, including four premium artworks',()=>{
  for (const category of BUSINESS_ICON_CATEGORIES.filter((item) => item.id !== 'classic')) {
    assert.equal(BUSINESS_ICON_SYMBOLS.filter((symbol) => symbol.category === category.id).length,28,category.label);
    assert.equal(BUSINESS_ICON_SYMBOLS.filter((symbol) => symbol.category === category.id && BUSINESS_ICON_RASTER_SYMBOL_IDS.includes(symbol.id as typeof BUSINESS_ICON_RASTER_SYMBOL_IDS[number])).length,4,category.label);
  }
  assert.equal(BUSINESS_ADMIN_ICON_IDS.length,new Set(BUSINESS_ADMIN_ICON_IDS).size);
  assert.equal(BUSINESS_ICON_SYMBOLS.length * BUSINESS_ICON_COLORS.length,1872);
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


test('all selectable artworks are distinct vectors and changed art bypasses old immutable cache', () => {
  const artwork = BUSINESS_ICON_SYMBOLS.map((symbol) => businessAdminIconPreviewAsset(symbol.id));
  assert.ok(artwork.every(Boolean));
  assert.equal(new Set(artwork).size, BUSINESS_ICON_SYMBOLS.length);
  assert.match(businessAdminIconAssetUrl('nails_purple', 'אלכס')!, /v=39/);
  for (const id of BUSINESS_ADMIN_ICON_IDS) if (!isBusinessAdminRasterIcon(id)) assert.doesNotMatch(businessAdminIconSvg(id)!, /Apple Color Emoji/);
  assert.ok(isBusinessAdminRasterIcon('hairScissorsGem_purple'));
  assert.equal(isBusinessAdminRasterIcon('flower_purple'),false);
  assert.match(businessAdminIconSvg('hairScissorsGem_purple','Hair Studio','data:image/webp;base64,AAAA')!, /href="data:image\/webp;base64,AAAA"/);
  assert.ok(businessAdminIconPreviewSvg('nails')?.includes('<svg'));
  for (const id of BUSINESS_ICON_RASTER_SYMBOL_IDS) {
    const bytes = readFileSync(`public/business-icon-artwork/${id}.webp`);
    assert.equal(bytes.toString('ascii',0,4),'RIFF',`${id} artwork is missing or not WebP`);
    assert.equal(bytes.toString('ascii',8,12),'WEBP',`${id} artwork has an invalid WebP header`);
  }
});
