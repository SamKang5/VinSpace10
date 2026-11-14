// Reviewed SHA-256 pins for the baseline terrain assets. Change only in a
// reviewed data update after independently verifying the new source package.
// These values are bundled in application code, never downloaded with assets.
export const TERRAIN_SHA256 = {
  'navigation_grid.bin': '2346fd02d19c67051b27d3211a96786c10d907af896288cb2cea2d9386e3def8',
  'grid_metadata.json': 'b2c69392590c84321f32866b025de4de4eb46b256e59f649e21722aa9e0dc3f6',
  'ctx-aoi-meta.json': '7c3afef4196f0cc404aedbddf50d7866e4ce3d188612b99af9fefdbc74b87d0d',
  'elevation.bin': '7e01f7c7062194767c6edfcb3d206dd48bede8739a6025a164ff8fbabb1477e9',
  'hazard.bin': '76c93854b52789c00f53c8e82b5ba74e86232600a91c11cb39cf5305061775c6',
  'overlay_metadata.json': '1559ac80fc6aa92b0ce5b20fb52f2dc8b6549f7b8093e53ecc644947f80ccc8b',
  'ctx-jezero-aoi.png': '38929d6ae052eff335659d792054de91989e50be23e62ad4d99853b9d26da2a2',
} as const;
