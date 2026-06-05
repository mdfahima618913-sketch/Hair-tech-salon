// Shared service image resolution — used by BookingSystem, ServiceManager, etc.

export const CAT_IMG: Record<string, string> = {
  'Hair Cut':       'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600&q=85&auto=format&fit=crop',
  'Hair Styling':   'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=85&auto=format&fit=crop',
  'Hair Wash':      'https://images.unsplash.com/photo-1559894244-2ccea83bc218?w=600&q=85&auto=format&fit=crop',
  'Hair Colouring': 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&q=85&auto=format&fit=crop',
  'Hair Treatment': 'https://images.unsplash.com/photo-1626957341926-98752fc2ba62?w=600&q=85&auto=format&fit=crop',
  'Hair Spa':       'https://images.unsplash.com/photo-1626957341926-98752fc2ba62?w=600&q=85&auto=format&fit=crop',
  'Basic Beauty':   'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop',
  'Cleanup':        'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop',
  'Detan':          'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=85&auto=format&fit=crop',
  'Add-ons':        'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=600&q=85&auto=format&fit=crop',
  'Nail Services':  'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&q=85&auto=format&fit=crop',
  'Mani & Pedi':    'https://images.unsplash.com/photo-1519419451778-14599a49ec41?w=600&q=85&auto=format&fit=crop',
  'Beard & Shave':  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600&q=85&auto=format&fit=crop',
  'Massages':       'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=85&auto=format&fit=crop',
  'Makeup':         'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=85&auto=format&fit=crop',
  'Scalp & Skin':   'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=600&q=85&auto=format&fit=crop',
  'Combos':         'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=600&q=85&auto=format&fit=crop',
};

const SVC_IMG: Array<[RegExp, string]> = [
  [/male.*haircut|haircut.*male/i,                  'https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600&q=85&auto=format&fit=crop'],
  [/wolf cut/i,                                     'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=600&q=85&auto=format&fit=crop'],
  [/layer cut|u cut|female.*haircut/i,              'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=85&auto=format&fit=crop'],
  [/beard|shave/i,                                  'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=600&q=85&auto=format&fit=crop'],
  [/wedding.*makeup|bridal.*makeup/i,               'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=85&auto=format&fit=crop'],
  [/engagement.*makeup/i,                           'https://images.unsplash.com/photo-1515374779-4fb19bb49f48?w=600&q=85&auto=format&fit=crop'],
  [/party makeup/i,                                 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&q=85&auto=format&fit=crop'],
  [/gold facial/i,                                  'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop'],
  [/hydra facial|hydra cleanup/i,                   'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
  [/facial/i,                                       'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
  [/nail art|nail ext|gel polish|gel overlay|manicure/i, 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&q=85&auto=format&fit=crop'],
  [/pedicure/i,                                     'https://images.unsplash.com/photo-1519419451778-14599a49ec41?w=600&q=85&auto=format&fit=crop'],
  [/body massage/i,                                 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=85&auto=format&fit=crop'],
  [/head massage|champi/i,                          'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=85&auto=format&fit=crop'],
  [/full body wax|half back wax/i,                  'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=85&auto=format&fit=crop'],
  [/face wax|upper lips|eyebrow|threading/i,        'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=600&q=85&auto=format&fit=crop'],
  [/underarms/i,                                    'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=85&auto=format&fit=crop'],
  [/face scrub|face massage/i,                      'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop'],
  [/highlight|balayage|ombre/i,                     'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&q=85&auto=format&fit=crop'],
  [/colour|color/i,                                 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600&q=85&auto=format&fit=crop'],
  [/keratin|smoothen|rebond/i,                      'https://images.unsplash.com/photo-1626957341926-98752fc2ba62?w=600&q=85&auto=format&fit=crop'],
  [/hair spa|spa treatment/i,                       'https://images.unsplash.com/photo-1626957341926-98752fc2ba62?w=600&q=85&auto=format&fit=crop'],
  [/blow.?dry/i,                                    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=85&auto=format&fit=crop'],
  [/styling/i,                                      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=85&auto=format&fit=crop'],
  [/hair wash|shampoo/i,                            'https://images.unsplash.com/photo-1559894244-2ccea83bc218?w=600&q=85&auto=format&fit=crop'],
  [/detan|de-tan/i,                                 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=600&q=85&auto=format&fit=crop'],
  [/cleanup|clean.?up/i,                            'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop'],
  [/scalp/i,                                        'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=600&q=85&auto=format&fit=crop'],
  [/combo/i,                                        'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=600&q=85&auto=format&fit=crop'],
  [/anti.?aging/i,                                  'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
  [/brightening|fruit facial|organic facial/i,      'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600&q=85&auto=format&fit=crop'],
  [/o3 facial|o3 cleanup/i,                         'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
  [/pearl facial/i,                                 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=85&auto=format&fit=crop'],
];

const FALLBACK = 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=600&q=85&auto=format&fit=crop';

/** Returns the best image URL for a service — custom imageUrl first, then name-pattern, then category, then fallback. */
export function getServiceImage(name: string, category: string, imageUrl?: string): string {
  if (imageUrl?.trim()) return imageUrl.trim();
  for (const [re, img] of SVC_IMG) if (re.test(name)) return img;
  return CAT_IMG[category] ?? FALLBACK;
}
