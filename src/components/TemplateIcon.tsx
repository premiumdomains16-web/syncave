// Line icons for the industry templates (replaces the old emoji icons).
import {
  Briefcase, Building2, Dumbbell, GraduationCap, HandHeart, Headphones, Landmark, PenLine,
  Scissors, ShoppingBag, Stethoscope, Ticket, UtensilsCrossed, BedDouble, Zap, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  blank: PenLine,
  ecommerce: ShoppingBag,
  financial: Landmark,
  digital: Zap,
  support: Headphones,
  education: GraduationCap,
  hospitality: BedDouble,
  restaurant: UtensilsCrossed,
  realestate: Building2,
  healthcare: Stethoscope,
  salon: Scissors,
  fitness: Dumbbell,
  agency: Briefcase,
  events: Ticket,
  nonprofit: HandHeart,
};

export function TemplateIcon({ id, className = 'w-4 h-4' }: { id: string; className?: string }) {
  const Icon = ICONS[id] ?? PenLine;
  return <Icon className={className} aria-hidden />;
}
