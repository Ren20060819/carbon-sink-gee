// ========== 1. 研究区 ==========
var roi = /* color: #98ff00 */ee.Geometry.Polygon(
        [[[103.808290518089, 35.85862932648764],
          [103.8687153227765, 35.76842475106119],
          [103.874208486839, 35.72272659587894],
          [104.07882884816712, 35.63794846289953],
          [104.13650707082337, 35.61897260859477],
          [104.15710643605775, 35.71492185023787],
          [104.181825674339, 35.77622425290505],
          [104.104921377464, 35.807414609646855],
          [104.04174999074525, 35.86864573009538],
          [103.94973949269837, 35.94539608978392],
          [103.85360912160462, 35.94539608978392],
          [103.80966380910462, 35.87532262921166]]]);
Map.centerObject(roi, 8);

// ========== 2. SCL 云掩膜 ==========
function maskS2clouds(image) {
  var scl = image.select('SCL');

  // 保留：植被(4)、裸土(5)、水体(6)
  var mask = scl.eq(4)
                .or(scl.eq(5))
                .or(scl.eq(6));

  return image.updateMask(mask)
              .divide(10000);
}

// ========== 3. 读取 Sentinel-2 SR ==========
var s2_20251 = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterBounds(roi)
  .filterDate('2025-06-01', '2025-08-01')
  .map(selectBands)
  .map(maskS2clouds)
  .median();


// ========== 4. 计算 NDVI ==========
var ndvi = s2_20251
            .normalizedDifference(['B8', 'B4'])
            .rename('NDVI');


// ========== 5. 显示 ==========
Map.addLayer(ndvi, {min: 0, max: 0.8, palette: ['white', 'green']}, 'NDVI 20251');
// ========== 6. 第二个年份（2023） ==========
var s2_20252 = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterBounds(roi)
  .filterDate('2025-08-01', '2025-09-30')
  .map(selectBands)
  .map(maskS2clouds)
  .median();


var ndvi_20252 = s2_20252
                  .normalizedDifference(['B8', 'B4'])
                  .rename('NDVI');

// 显示
Map.addLayer(ndvi_20252,
  {min: 0, max: 0.8, palette: ['white', 'green']},
  'NDVI 20252'
);

// ========== 7. NDVI → 植被覆盖度 FVC ==========
var NDVI_soil = 0.1;
var NDVI_veg  = 0.8;

function ndviToFVC(ndvi) {
  return ndvi.subtract(NDVI_soil)
             .divide(NDVI_veg - NDVI_soil)
             .clamp(0, 1)
             .rename('FVC');
}

var fvc_20251 = ndviToFVC(ndvi);
var fvc_20252 = ndviToFVC(ndvi_20252);

// 显示
Map.addLayer(fvc_20251,
  {min: 0, max: 1, palette: ['white', 'green']},
  'FVC 20251'
);

Map.addLayer(fvc_20252,
  {min: 0, max: 1, palette: ['white', 'green']},
  'FVC 20252'
);
// ========== 8. FVC → 地上生物量 AGB ==========
/*
示例参数说明：
- 适用于草地 / 灌丛为主区域（黄土高原常见）
- 单位：t/ha
*/
var AGB_coeff = 120;

function fvcToAGB(fvc) {
  return fvc.multiply(AGB_coeff)
            .rename('AGB');
}

var agb_20251 = fvcToAGB(fvc_20251);
var agb_20252 = fvcToAGB(fvc_20252);

// 显示
Map.addLayer(agb_20251,
  {min: 0, max: 100, palette: ['yellow', 'green']},
  'AGB 20251'
);

Map.addLayer(agb_20252,
  {min: 0, max: 100, palette: ['yellow', 'green']},
  'AGB 20252'
);
// ========== 9. 生物量 → 植被碳储量 ==========
/*
IPCC 默认：
干生物量中 ≈45% 为碳
*/
function agbToCarbon(agb) {
  return agb.multiply(0.45)
            .rename('Carbon');
}

var carbon_20251 = agbToCarbon(agb_20251);
var carbon_20252 = agbToCarbon(agb_20252);

// 显示
Map.addLayer(carbon_20251,
  {min: 0, max: 50, palette: ['yellow', 'darkgreen']},
  'Carbon 20251'
);

Map.addLayer(carbon_20252,
  {min: 0, max: 50, palette: ['yellow', 'darkgreen']},
  'Carbon 20252'
);
// ========== 10. 碳汇变化量 ==========
var delta_carbon = carbon_20252
                    .subtract(carbon_20251)
                    .rename('Delta_Carbon');

// 显示
Map.addLayer(delta_carbon,
  {min: -10, max: 10, palette: ['red', 'white', 'green']},
  'Carbon Sink Change'
);
// ========== 11. 区域平均碳汇 ==========
var stats = delta_carbon.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: roi,
  scale: 10,
  maxPixels: 1e13
});

print('平均碳汇变化 (t C / ha):', stats);
function selectBands(image) {
  return image.select(['B4', 'B8', 'SCL']);
}
Export.image.toDrive({
  image: delta_carbon,
  description: 'Carbon_Sink_Change_20252_20251',
  folder: 'GEE_Carbon',
  region: roi,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
