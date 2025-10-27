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
  '360bar': bundle(require('./restaurants/360bar/1.webp'), [
    require('./restaurants/360bar/1.webp'),
    require('./restaurants/360bar/2.webp'),
    require('./restaurants/360bar/3.webp'),
    require('./restaurants/360bar/4.webp'),
    require('./restaurants/360bar/5.webp'),
  ]),
  'artclub': bundle(require('./restaurants/artclub/1.webp'), [
    require('./restaurants/artclub/1.webp'),
    require('./restaurants/artclub/2.webp'),
    require('./restaurants/artclub/3.webp'),
    require('./restaurants/artclub/4.webp'),
    require('./restaurants/artclub/5.webp'),
  ]),
  'chinar': bundle(require('./restaurants/chinar/1.webp'), [
    require('./restaurants/chinar/1.webp'),
    require('./restaurants/chinar/2.webp'),
    require('./restaurants/chinar/3.webp'),
    require('./restaurants/chinar/4.webp'),
    require('./restaurants/chinar/5.webp'),
  ]),
  'dolma': bundle(require('./restaurants/dolma/1.webp'), [
    require('./restaurants/dolma/1.webp'),
    require('./restaurants/dolma/2.webp'),
    require('./restaurants/dolma/3.webp'),
    require('./restaurants/dolma/4.webp'),
    require('./restaurants/dolma/5.webp'),
  ]),
  'firuze': bundle(require('./restaurants/firuze/1.webp'), [
    require('./restaurants/firuze/1.webp'),
    require('./restaurants/firuze/2.webp'),
    require('./restaurants/firuze/3.webp'),
    require('./restaurants/firuze/4.webp'),
    require('./restaurants/firuze/5.webp'),
  ]),
  'mangal': bundle(require('./restaurants/mangal/1.webp'), [
    require('./restaurants/mangal/1.webp'),
    require('./restaurants/mangal/2.webp'),
    require('./restaurants/mangal/3.webp'),
    require('./restaurants/mangal/4.webp'),
    require('./restaurants/mangal/5.webp'),
  ]),
  'marivanna': bundle(require('./restaurants/marivanna/1.webp'), [
    require('./restaurants/marivanna/1.webp'),
    require('./restaurants/marivanna/2.webp'),
    require('./restaurants/marivanna/3.webp'),
    require('./restaurants/marivanna/4.webp'),
    require('./restaurants/marivanna/5.webp'),
  ]),
  'mugam': bundle(require('./restaurants/mugam/1.webp'), [
    require('./restaurants/mugam/1.webp'),
    require('./restaurants/mugam/2.webp'),
    require('./restaurants/mugam/3.webp'),
    require('./restaurants/mugam/4.webp'),
    require('./restaurants/mugam/5.webp'),
  ]),
  'novikov': bundle(require('./restaurants/novikov/1.webp'), [
    require('./restaurants/novikov/1.webp'),
    require('./restaurants/novikov/2.webp'),
    require('./restaurants/novikov/3.webp'),
    require('./restaurants/novikov/4.webp'),
    require('./restaurants/novikov/5.webp'),
  ]),
  'oronero': bundle(require('./restaurants/oronero/1.webp'), [
    require('./restaurants/oronero/1.webp'),
    require('./restaurants/oronero/2.webp'),
    require('./restaurants/oronero/3.webp'),
    require('./restaurants/oronero/4.webp'),
    require('./restaurants/oronero/5.webp'),
  ]),
  'qaladivari': bundle(require('./restaurants/qaladivari/1.webp'), [
    require('./restaurants/qaladivari/1.webp'),
    require('./restaurants/qaladivari/2.webp'),
    require('./restaurants/qaladivari/3.webp'),
    require('./restaurants/qaladivari/4.webp'),
    require('./restaurants/qaladivari/5.webp'),
  ]),
  'qaynana': bundle(require('./restaurants/qaynana/1.webp'), [
    require('./restaurants/qaynana/1.webp'),
    require('./restaurants/qaynana/2.webp'),
    require('./restaurants/qaynana/3.webp'),
    require('./restaurants/qaynana/4.webp'),
    require('./restaurants/qaynana/5.webp'),
  ]),
  'sahil': bundle(require('./restaurants/sahil/1.webp'), [
    require('./restaurants/sahil/1.webp'),
    require('./restaurants/sahil/2.webp'),
    require('./restaurants/sahil/3.webp'),
    require('./restaurants/sahil/4.webp'),
    require('./restaurants/sahil/5.webp'),
  ]),
  'shah': bundle(require('./restaurants/shah/1.webp'), [
    require('./restaurants/shah/1.webp'),
    require('./restaurants/shah/2.webp'),
    require('./restaurants/shah/3.webp'),
    require('./restaurants/shah/4.webp'),
    require('./restaurants/shah/5.webp'),
  ]),
  'shirvanshah': bundle(require('./restaurants/shirvanshah/1.webp'), [
    require('./restaurants/shirvanshah/1.webp'),
    require('./restaurants/shirvanshah/2.webp'),
    require('./restaurants/shirvanshah/3.webp'),
    require('./restaurants/shirvanshah/4.webp'),
    require('./restaurants/shirvanshah/5.webp'),
  ]),
  'skygrill': bundle(require('./restaurants/skygrill/1.webp'), [
    require('./restaurants/skygrill/1.webp'),
    require('./restaurants/skygrill/2.webp'),
    require('./restaurants/skygrill/3.webp'),
    require('./restaurants/skygrill/4.webp'),
    require('./restaurants/skygrill/5.webp'),
  ]),
  'sumakh': bundle(require('./restaurants/sumakh/1.webp'), [
    require('./restaurants/sumakh/1.webp'),
    require('./restaurants/sumakh/2.webp'),
    require('./restaurants/sumakh/3.webp'),
    require('./restaurants/sumakh/4.webp'),
    require('./restaurants/sumakh/5.webp'),
  ]),
};
