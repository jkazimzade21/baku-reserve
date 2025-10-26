import type { ImageSourcePropType } from 'react-native';

export type RestaurantAssetBundle = {
  cover?: ImageSourcePropType;
  gallery?: ImageSourcePropType[];
  pending?: boolean;
};

const bundle = (
  cover: ImageSourcePropType,
  gallery: ImageSourcePropType[],
): RestaurantAssetBundle => ({
  cover,
  gallery,
});

const pendingBundle = (): RestaurantAssetBundle => ({
  pending: true,
});

export const PENDING_PHOTO_SLUGS = new Set<string>([
  'caybagi145',
  'nergiz',
  'passage145',
  'paulaner',
  'riviera',
  'syrovarnya',
  'vapiano',
  'zafferano',
]);

export const restaurantPhotoManifest: Record<string, RestaurantAssetBundle> = {
  '360bar': bundle(require('./restaurants/360bar/1.png'), [
    require('./restaurants/360bar/1.png'),
    require('./restaurants/360bar/2.png'),
    require('./restaurants/360bar/3.png'),
    require('./restaurants/360bar/4.png'),
    require('./restaurants/360bar/5.png'),
  ]),
  artclub: bundle(require('./restaurants/artclub/1.png'), [
    require('./restaurants/artclub/1.png'),
    require('./restaurants/artclub/2.png'),
    require('./restaurants/artclub/3.png'),
    require('./restaurants/artclub/4.png'),
    require('./restaurants/artclub/5.png'),
  ]),
  chinar: bundle(require('./restaurants/chinar/1.png'), [
    require('./restaurants/chinar/1.png'),
    require('./restaurants/chinar/2.png'),
    require('./restaurants/chinar/3.png'),
    require('./restaurants/chinar/4.png'),
    require('./restaurants/chinar/5.png'),
  ]),
  dolma: bundle(require('./restaurants/dolma/1.png'), [
    require('./restaurants/dolma/1.png'),
    require('./restaurants/dolma/2.png'),
    require('./restaurants/dolma/3.png'),
    require('./restaurants/dolma/4.png'),
    require('./restaurants/dolma/5.png'),
  ]),
  firuze: bundle(require('./restaurants/firuze/1.png'), [
    require('./restaurants/firuze/1.png'),
    require('./restaurants/firuze/2.png'),
    require('./restaurants/firuze/3.png'),
    require('./restaurants/firuze/4.png'),
    require('./restaurants/firuze/5.png'),
  ]),
  mangal: bundle(require('./restaurants/mangal/1.png'), [
    require('./restaurants/mangal/1.png'),
    require('./restaurants/mangal/2.png'),
    require('./restaurants/mangal/3.png'),
    require('./restaurants/mangal/4.png'),
    require('./restaurants/mangal/5.png'),
  ]),
  marivanna: bundle(require('./restaurants/marivanna/1.png'), [
    require('./restaurants/marivanna/1.png'),
    require('./restaurants/marivanna/2.png'),
    require('./restaurants/marivanna/3.png'),
    require('./restaurants/marivanna/4.png'),
    require('./restaurants/marivanna/5.png'),
  ]),
  mugam: bundle(require('./restaurants/mugam/1.png'), [
    require('./restaurants/mugam/1.png'),
    require('./restaurants/mugam/2.png'),
    require('./restaurants/mugam/3.png'),
    require('./restaurants/mugam/4.png'),
    require('./restaurants/mugam/5.png'),
  ]),
  novikov: bundle(require('./restaurants/novikov/1.png'), [
    require('./restaurants/novikov/1.png'),
    require('./restaurants/novikov/2.png'),
    require('./restaurants/novikov/3.png'),
    require('./restaurants/novikov/4.png'),
    require('./restaurants/novikov/5.png'),
  ]),
  oronero: bundle(require('./restaurants/oronero/1.png'), [
    require('./restaurants/oronero/1.png'),
    require('./restaurants/oronero/2.png'),
    require('./restaurants/oronero/3.png'),
    require('./restaurants/oronero/4.png'),
    require('./restaurants/oronero/5.png'),
  ]),
  qaladivari: bundle(require('./restaurants/qaladivari/1.png'), [
    require('./restaurants/qaladivari/1.png'),
    require('./restaurants/qaladivari/2.png'),
    require('./restaurants/qaladivari/3.png'),
    require('./restaurants/qaladivari/4.png'),
    require('./restaurants/qaladivari/5.png'),
  ]),
  qaynana: bundle(require('./restaurants/qaynana/1.png'), [
    require('./restaurants/qaynana/1.png'),
    require('./restaurants/qaynana/2.png'),
    require('./restaurants/qaynana/3.png'),
    require('./restaurants/qaynana/4.png'),
    require('./restaurants/qaynana/5.png'),
  ]),
  sahil: bundle(require('./restaurants/sahil/1.png'), [
    require('./restaurants/sahil/1.png'),
    require('./restaurants/sahil/2.png'),
    require('./restaurants/sahil/3.png'),
    require('./restaurants/sahil/4.png'),
    require('./restaurants/sahil/5.png'),
  ]),
  shah: bundle(require('./restaurants/shah/1.png'), [
    require('./restaurants/shah/1.png'),
    require('./restaurants/shah/2.png'),
    require('./restaurants/shah/3.png'),
    require('./restaurants/shah/4.png'),
    require('./restaurants/shah/5.png'),
  ]),
  shirvanshah: bundle(require('./restaurants/shirvanshah/1.png'), [
    require('./restaurants/shirvanshah/1.png'),
    require('./restaurants/shirvanshah/2.png'),
    require('./restaurants/shirvanshah/3.png'),
    require('./restaurants/shirvanshah/4.png'),
    require('./restaurants/shirvanshah/5.png'),
  ]),
  skygrill: bundle(require('./restaurants/skygrill/1.png'), [
    require('./restaurants/skygrill/1.png'),
    require('./restaurants/skygrill/2.png'),
    require('./restaurants/skygrill/3.png'),
    require('./restaurants/skygrill/4.png'),
    require('./restaurants/skygrill/5.png'),
  ]),
  sumakh: bundle(require('./restaurants/sumakh/1.png'), [
    require('./restaurants/sumakh/1.png'),
    require('./restaurants/sumakh/2.png'),
    require('./restaurants/sumakh/3.png'),
    require('./restaurants/sumakh/4.png'),
    require('./restaurants/sumakh/5.png'),
  ]),
  caybagi145: pendingBundle(),
  nergiz: pendingBundle(),
  passage145: pendingBundle(),
  paulaner: pendingBundle(),
  riviera: pendingBundle(),
  syrovarnya: pendingBundle(),
  vapiano: pendingBundle(),
  zafferano: pendingBundle(),
};
