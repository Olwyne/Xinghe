export const SHORT_RITUALS = [
  { icon: '🧘', text: 'Ferme les yeux. Inspire 4s, retiens 4s, expire 4s.' },
  { icon: '👁️', text: 'Regarde un point à plus de 6m pendant 20 secondes.' },
  { icon: '🤸', text: 'Étire doucement le cou : oreille vers épaule, 3 fois.' },
  { icon: '💧', text: 'Bois un verre d\'eau, debout.' },
  { icon: '🙆', text: 'Lève les bras, bâille, secoue les poignets.' },
]

export const LONG_RITUALS = [
  { icon: '🚶', text: 'Marche 10 minutes à l\'extérieur si possible.' },
  { icon: '🍵', text: 'Prépare une boisson chaude. Prends le temps de la sentir.' },
  { icon: '🌿', text: 'Médite 10 minutes : suis juste ta respiration.' },
  { icon: '📓', text: 'Note 3 choses positives de la dernière heure.' },
  { icon: '🔆', text: 'Expose-toi à la lumière naturelle pendant quelques minutes.' },
]

export function pickRitual(type: 'short' | 'long'): { icon: string; text: string } {
  const list = type === 'long' ? LONG_RITUALS : SHORT_RITUALS
  return list[Math.floor(Math.random() * list.length)]
}
