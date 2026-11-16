// Every text the UI shows. The app is Hungarian only; keeping the strings here means an
// English version would only need a second copy of this object.
export const t = {
  appName: 'Spájz',
  loading: 'Betöltés…',
  greeting: (name: string) => `Szia, ${name}!`,
  comingSoon: 'Hamarosan: helyek és készletszintek.',
  nickname: {
    prompt: 'Hogy szólítsunk?',
    hint: 'Ezt a nevet látja a másik is, például az értesítésekben.',
    label: 'Becenév',
    save: 'Mentés',
    saving: 'Mentés…',
    cancel: 'Mégse',
    editHint: 'Becenév módosítása',
    saveFailed: 'Nem sikerült menteni. Próbáld újra.',
  },
  errors: {
    unreachable: 'Nem érem el a szervert.',
    noIdentity: 'Az alkalmazást a Tailscale-címén nyisd meg.',
    unexpected: 'Váratlan válasz a szervertől.',
    status: (status: number) => `A szerver hibát jelzett (${status}).`,
  },
}
