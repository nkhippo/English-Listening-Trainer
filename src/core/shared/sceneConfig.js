export const SCENES = {
  phone: {
    label: '電話',
    en: 'phone call',
    description:
      'phone calls: customer support, booking, appointments, inquiries. No visual context. Formulaic openings/closings.',
  },
  shop: {
    label: '店・カフェ',
    en: 'shop / cafe',
    description:
      'short transactional exchanges at a shop, cafe, restaurant, or counter. Greetings, ordering, payment, takeaway.',
  },
  workplace: {
    label: '職場',
    en: 'workplace',
    description:
      'short workplace exchanges: quick check-ins, scheduling, asking for status, brief meeting openings. Semi-formal.',
  },
  friends: {
    label: '友人',
    en: 'friends chatting',
    description:
      'casual conversation between friends: plans, catching up, sharing news, informal invitations.',
  },
  travel: {
    label: '旅行',
    en: 'travel',
    description:
      'travel situations: airports, hotels, directions, tickets, short exchanges with staff or fellow travelers.',
  },
  daily: {
    label: '日常',
    en: 'daily life',
    description:
      'everyday home and neighborhood situations: errands, schedules, weather, simple requests to people nearby.',
  },
};

export function migrateSceneId(stored) {
  if (stored === 'store') return 'shop';
  return SCENES[stored] ? stored : 'phone';
}
