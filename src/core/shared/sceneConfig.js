export const SCENES = {
  phone: {
    label: 'Phone',
    en: 'phone call',
    description:
      'phone calls: customer support, booking, appointments, inquiries. No visual context. Formulaic openings/closings.',
  },
  shop: {
    label: 'Shop / Cafe',
    en: 'shop / cafe',
    description:
      'short transactional exchanges at a shop, cafe, restaurant, or counter. Greetings, ordering, payment, takeaway.',
  },
  workplace: {
    label: 'Workplace',
    en: 'workplace',
    description:
      'short workplace exchanges: quick check-ins, scheduling, asking for status, brief meeting openings. Semi-formal.',
  },
  friends: {
    label: 'Friends',
    en: 'friends chatting',
    description:
      'casual conversation between friends: plans, catching up, sharing news, informal invitations.',
  },
  travel: {
    label: 'Travel',
    en: 'travel',
    description:
      'travel situations: airports, hotels, directions, tickets, short exchanges with staff or fellow travelers.',
  },
  daily: {
    label: 'Daily life',
    en: 'daily life',
    description:
      'everyday home and neighborhood situations: errands, schedules, weather, simple requests to people nearby.',
  },
};

/** Migrate legacy scene ids from localStorage. */
export function migrateSceneId(stored) {
  if (stored === 'store') return 'shop';
  return SCENES[stored] ? stored : 'phone';
}
